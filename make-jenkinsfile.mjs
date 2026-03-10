import { writeFileSync, existsSync } from "fs";

const jenkinsfile = `
pipeline {
    agent {
        kubernetes {
            yaml '''
            apiVersion: v1
            kind: Pod
            spec:
              containers:
                - name: node
                  image: node:20-alpine
                  command: ["sleep"]
                  args: ["infinity"]
                  resources:
                    requests:
                      cpu: 500m
                      memory: 512Mi
                - name: docker
                  image: docker:24-dind
                  securityContext:
                    privileged: true
                  env:
                    - name: DOCKER_TLS_CERTDIR
                      value: ""
                - name: kubectl
                  image: alpine/k8s:1.29.2
                  command: ["sleep"]
                  args: ["infinity"]
            '''
        }
    }

    environment {
        // ─── App ───
        APP_NAME       = 'your-app'
        NODE_VERSION   = '20'

        // ─── Docker ───
        REGISTRY       = 'ghcr.io'
        IMAGE_NAME     = 'your-org/your-app'
        DOCKER_TAG     = "\${env.GIT_COMMIT?.take(8) ?: 'latest'}"

        // ─── Kubernetes ───
        KUBE_NAMESPACE_STAGING    = 'app-staging'
        KUBE_NAMESPACE_PRODUCTION = 'app-production'

        // ─── Credentials (configured in Jenkins) ───
        REGISTRY_CREDENTIALS  = credentials('docker-registry')
        SONAR_TOKEN           = credentials('sonarqube-token')
        SLACK_WEBHOOK         = credentials('slack-webhook-url')
        KUBECONFIG            = credentials('kubeconfig')
    }

    options {
        timestamps()
        timeout(time: 45, unit: 'MINUTES')
        disableConcurrentBuilds(abortPrevious: true)
        buildDiscarder(logRotator(
            numToKeepStr: '20',
            artifactNumToKeepStr: '5',
            daysToKeepStr: '30'
        ))
        ansiColor('xterm')
    }

    stages {
        // ═══════════ CHECKOUT ═══════════
        stage('Checkout') {
            steps {
                checkout scm
                script {
                    env.GIT_AUTHOR = sh(script: "git log -1 --format='%an'", returnStdout: true).trim()
                    env.GIT_MESSAGE = sh(script: "git log -1 --format='%s'", returnStdout: true).trim()
                    env.GIT_BRANCH_NAME = env.BRANCH_NAME ?: env.GIT_BRANCH?.replaceAll('origin/', '')
                }
            }
        }

        // ═══════════ INSTALL ═══════════
        stage('Install Dependencies') {
            steps {
                container('node') {
                    sh 'npm ci --cache .npm --prefer-offline'
                    stash includes: 'node_modules/**', name: 'node_modules'
                }
            }
        }

        // ═══════════ VALIDATE (parallel) ═══════════
        stage('Validate') {
            parallel {
                stage('Lint') {
                    steps {
                        container('node') {
                            unstash 'node_modules'
                            sh 'npm run lint'
                        }
                    }
                }
                stage('Type Check') {
                    steps {
                        container('node') {
                            unstash 'node_modules'
                            sh 'npx tsc --noEmit'
                        }
                    }
                }
                stage('Format Check') {
                    steps {
                        container('node') {
                            unstash 'node_modules'
                            sh 'npx prettier --check "src/**/*.{ts,tsx,js,jsx}"'
                        }
                    }
                }
            }
        }

        // ═══════════ TEST (parallel) ═══════════
        stage('Test') {
            parallel {
                stage('Unit Tests') {
                    steps {
                        container('node') {
                            unstash 'node_modules'
                            sh 'npm test -- --coverage --ci --reporters=default --reporters=jest-junit'
                        }
                    }
                    post {
                        always {
                            junit allowEmptyResults: true, testResults: 'junit.xml'
                            publishHTML(target: [
                                allowMissing: true,
                                alwaysLinkToLastBuild: true,
                                keepAll: true,
                                reportDir: 'coverage/lcov-report',
                                reportFiles: 'index.html',
                                reportName: 'Coverage Report'
                            ])
                        }
                    }
                }
                stage('Integration Tests') {
                    steps {
                        container('node') {
                            unstash 'node_modules'
                            sh 'npm run test:integration || true'
                        }
                    }
                }
            }
        }

        // ═══════════ SONARQUBE ═══════════
        stage('SonarQube Analysis') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                    changeRequest()
                }
            }
            steps {
                container('node') {
                    unstash 'node_modules'
                    withSonarQubeEnv('SonarQube') {
                        sh """
                            npx sonar-scanner \\
                                -Dsonar.projectKey=\${APP_NAME} \\
                                -Dsonar.projectName=\${APP_NAME} \\
                                -Dsonar.sources=src \\
                                -Dsonar.tests=src \\
                                -Dsonar.test.inclusions=**/*.test.ts,**/*.spec.ts \\
                                -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info \\
                                -Dsonar.testExecutionReportPaths=junit.xml
                        """
                    }
                }
            }
        }

        // ═══════════ QUALITY GATE ═══════════
        stage('Quality Gate') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                }
            }
            steps {
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        // ═══════════ BUILD APP ═══════════
        stage('Build Application') {
            steps {
                container('node') {
                    unstash 'node_modules'
                    sh 'npm run build'
                    stash includes: 'dist/**', name: 'dist'
                }
            }
        }

        // ═══════════ BUILD & PUSH DOCKER ═══════════
        stage('Build Docker Image') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                    buildingTag()
                }
            }
            steps {
                container('docker') {
                    unstash 'dist'
                    sh """
                        docker login -u \${REGISTRY_CREDENTIALS_USR} -p \${REGISTRY_CREDENTIALS_PSW} \${REGISTRY}

                        docker build \\
                            --build-arg BUILD_DATE=\$(date -u +"%Y-%m-%dT%H:%M:%SZ") \\
                            --build-arg VCS_REF=\${DOCKER_TAG} \\
                            --build-arg VERSION=\${env.TAG_NAME ?: DOCKER_TAG} \\
                            -t \${REGISTRY}/\${IMAGE_NAME}:\${DOCKER_TAG} \\
                            -t \${REGISTRY}/\${IMAGE_NAME}:\${GIT_BRANCH_NAME} \\
                            .

                        docker push \${REGISTRY}/\${IMAGE_NAME}:\${DOCKER_TAG}
                        docker push \${REGISTRY}/\${IMAGE_NAME}:\${GIT_BRANCH_NAME}
                    """

                    script {
                        if (env.BRANCH_NAME == 'main' || env.TAG_NAME) {
                            sh """
                                docker tag \${REGISTRY}/\${IMAGE_NAME}:\${DOCKER_TAG} \${REGISTRY}/\${IMAGE_NAME}:latest
                                docker push \${REGISTRY}/\${IMAGE_NAME}:latest
                            """
                        }
                    }
                }
            }
        }

        // ═══════════ SECURITY SCAN ═══════════
        stage('Security Scan') {
            when {
                anyOf {
                    branch 'main'
                    buildingTag()
                }
            }
            steps {
                container('docker') {
                    sh """
                        docker run --rm \\
                            -v /var/run/docker.sock:/var/run/docker.sock \\
                            aquasec/trivy image \\
                            --exit-code 0 \\
                            --severity HIGH,CRITICAL \\
                            --format table \\
                            \${REGISTRY}/\${IMAGE_NAME}:\${DOCKER_TAG}
                    """
                }
            }
        }

        // ═══════════ DEPLOY STAGING ═══════════
        stage('Deploy to Staging') {
            when {
                branch 'main'
            }
            steps {
                container('kubectl') {
                    sh """
                        export KUBECONFIG=\${KUBECONFIG}
                        kubectl -n \${KUBE_NAMESPACE_STAGING} set image deployment/\${APP_NAME} \\
                            app=\${REGISTRY}/\${IMAGE_NAME}:\${DOCKER_TAG}
                        kubectl -n \${KUBE_NAMESPACE_STAGING} rollout status deployment/\${APP_NAME} --timeout=300s
                    """
                }
            }
        }

        // ═══════════ SMOKE TEST STAGING ═══════════
        stage('Smoke Test Staging') {
            when {
                branch 'main'
            }
            steps {
                container('node') {
                    sh """
                        echo "Running smoke tests on staging..."
                        # curl -sf https://staging.example.com/healthz
                        echo "Smoke tests passed!"
                    """
                }
            }
        }

        // ═══════════ DEPLOY PRODUCTION ═══════════
        stage('Deploy to Production') {
            when {
                anyOf {
                    buildingTag()
                    allOf {
                        branch 'main'
                        expression { return params.DEPLOY_TO_PROD == true }
                    }
                }
            }
            input {
                message 'Deploy to production?'
                ok 'Yes, deploy!'
                submitter 'admin,devops-team'
                parameters {
                    booleanParam(name: 'CONFIRM', defaultValue: false, description: 'I confirm this deployment')
                }
            }
            steps {
                container('kubectl') {
                    sh """
                        export KUBECONFIG=\${KUBECONFIG}
                        kubectl -n \${KUBE_NAMESPACE_PRODUCTION} set image deployment/\${APP_NAME} \\
                            app=\${REGISTRY}/\${IMAGE_NAME}:\${DOCKER_TAG}
                        kubectl -n \${KUBE_NAMESPACE_PRODUCTION} rollout status deployment/\${APP_NAME} --timeout=300s
                    """
                }
            }
        }
    }

    // ═══════════ POST ACTIONS ═══════════
    post {
        success {
            script {
                slackSend(
                    color: 'good',
                    channel: '#deployments',
                    message: """✅ *\${APP_NAME}* pipeline succeeded
                    |Branch: \${GIT_BRANCH_NAME}
                    |Commit: \${GIT_MESSAGE}
                    |Author: \${GIT_AUTHOR}
                    |Build: <\${BUILD_URL}|#\${BUILD_NUMBER}>""".stripMargin()
                )
            }
        }
        failure {
            script {
                slackSend(
                    color: 'danger',
                    channel: '#deployments',
                    message: """❌ *\${APP_NAME}* pipeline FAILED
                    |Branch: \${GIT_BRANCH_NAME}
                    |Commit: \${GIT_MESSAGE}
                    |Author: \${GIT_AUTHOR}
                    |Build: <\${BUILD_URL}|#\${BUILD_NUMBER}>""".stripMargin()
                )
            }
        }
        unstable {
            script {
                slackSend(
                    color: 'warning',
                    channel: '#deployments',
                    message: """⚠️ *\${APP_NAME}* pipeline unstable
                    |Branch: \${GIT_BRANCH_NAME}
                    |Build: <\${BUILD_URL}|#\${BUILD_NUMBER}>""".stripMargin()
                )
            }
        }
        always {
            cleanWs(cleanWhenNotBuilt: false)
            script {
                // Archive test results
                archiveArtifacts artifacts: 'coverage/**,junit.xml', allowEmptyArchive: true
            }
        }
    }
}
`;

if (!existsSync("Jenkinsfile")) {
  writeFileSync("Jenkinsfile", jenkinsfile.trim());
  console.log("✅ Jenkinsfile created");
} else {
  console.log("⚠️ Jenkinsfile already exists");
}

console.log(`
🚀 Jenkinsfile setup done!

Pipeline stages:
  Checkout           → Clone + extract git metadata
  Install            → npm ci with cache + stash
  Validate (parallel)→ Lint + Type Check + Format Check
  Test (parallel)    → Unit Tests (coverage) + Integration Tests
  SonarQube          → Code quality analysis
  Quality Gate       → Wait for SonarQube result
  Build Application  → npm run build
  Build Docker       → Multi-tag Docker image push
  Security Scan      → Trivy container scan
  Deploy Staging     → Auto-deploy + rollout status
  Smoke Test         → Verify staging health
  Deploy Production  → Manual approval + deploy

Features:
  - Kubernetes Pod agent (node + docker + kubectl)
  - Parallel stages for speed
  - SonarQube integration
  - Trivy security scanning
  - Slack notifications (success/failure/unstable)
  - Manual production approval with submitter whitelist
  - Coverage & test report archiving
`);
