pipeline {
    agent any

    environment {
        REGISTRY = 'ktb9/travel-server-node' // Docker Hub 레지스트리 이름
        IMAGE_TAG = "${env.BUILD_NUMBER}" // 이미지 태그는 빌드 번호로 설정
    }

    stages {
        stage('Checkout') { // 소스 코드 다운로드
            steps {
                script {
                // 현재 커밋 해시 가져오기
                    env.GIT_COMMIT_HASH = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
                }
                git branch: 'main', url: 'https://github.com/ktb-9/travel-server-node.git'
            }
        }

        stage('Build and Push Docker Image') { // Docker 이미지 빌드 및 푸시
            steps {
                script {
                    withCredentials([usernamePassword(credentialsId: 'docker-hub-credentials', usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')]) {
                        sh '''
                        echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin
                        docker build -t $REGISTRY:$IMAGE_TAG .
                        docker push $REGISTRY:$IMAGE_TAG
                        '''
                    }
                }
            }
        }

        stage('Update Helm Chart in Infra Branch') { // Helm 차트 이미지 태그 업데이트
            steps {
                script {
                    withCredentials([usernamePassword(credentialsId: 'travel-jenkins-prac', usernameVariable: 'GIT_USER', passwordVariable: 'GIT_PASS')]) {
                        sh '''
                        git config --global user.email "green980611@naver.com"
                        git config --global user.name "ChoiYoo"
                        git checkout infra
                        sed -i "s/tag:.*/tag: ${IMAGE_TAG}/g" helm/values.yaml
                        git add helm/values.yaml
                        git commit -m "Chore: update image tag to ${IMAGE_TAG}" || echo "No changes to commit"
                        git push https://${GIT_USER}:${GIT_PASS}@github.com/ktb-9/travel-server-node.git infra
                        '''
                    }
                }
            }
        }

        stage('ArgoCD Sync') { // ArgoCD를 통한 어플리케이션 동기화
            steps {
                script {
                    withCredentials([usernamePassword(credentialsId: 'argocd-credentials', usernameVariable: 'ARGOCD_USER', passwordVariable: 'ARGOCD_PASS')]) {
                        sh '''
                        argocd login argocd.zero-dang.com --username ${ARGOCD_USER} --password ${ARGOCD_PASS} --insecure
                        argocd app sync riffletrip-server-node
                        '''
                    }
                }
            }
        }
    }

    post {
            always {
                cleanWs() // 작업 후 워크스페이스 정리
                script {
                    sh '''
                    docker system prune -a -f
                    '''
                }
            }
            success {
                script { // 빌드 성공 시 디스코드 알림
                    withCredentials([string(credentialsId: 'discord-webhook', variable: 'DISCORD_WEBHOOK')]) {
                        discordSend description: """
                        ✅ Build Success
                        실행 시간: ${currentBuild.duration / 1000}s
                        커밋 해시: ${env.GIT_COMMIT_HASH}
                        제목: ${currentBuild.displayName}
                        결과: ${currentBuild.result}
                        """,
                        link: env.BUILD_URL,
                        result: currentBuild.result,
                        title: "${env.JOB_NAME}: ${currentBuild.displayName} 성공",
                        webhookURL: "$DISCORD_WEBHOOK"
                    }
                }
            }
            failure {
                script { // 빌드 실패 시 디스코드 알림
                    withCredentials([string(credentialsId: 'discord-webhook', variable: 'DISCORD_WEBHOOK')]) {
                        discordSend description: """
                        ❌ Build Failed
                        실행 시간: ${currentBuild.duration / 1000}s
                        커밋 해시: ${env.GIT_COMMIT_HASH}
                        제목: ${currentBuild.displayName}
                        결과: ${currentBuild.result}
                        """,
                        link: env.BUILD_URL,
                        result: currentBuild.result,
                        title: "${env.JOB_NAME}: ${currentBuild.displayName} 실패",
                        webhookURL: "$DISCORD_WEBHOOK"
                    }
                }
            }
        }
    }
