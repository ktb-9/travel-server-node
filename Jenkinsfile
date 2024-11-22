pipeline {
    agent any

    environment {
        REGISTRY = 'ktb9/travel-server-node' // Docker Hub 레지스트리 이름
        IMAGE_TAG = "${env.BUILD_NUMBER}" // 이미지 태그는 빌드 번호로 설정
        DOCKER_CREDENTIALS = credentials('docker-hub-credentials')
    }

    stages {
        stage('Checkout') {
            steps {
                git branch: 'dev', url: 'https://github.com/ktb-9/travel-server-node.git'
            }
        }

        stage('Build and Push Docker Image') {
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

        stage('Update Helm Chart in Infra Branch') {
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
                        git push https://${GIT_USER}:${GIT_PASS}github.com/ktb-9/travel-server-node.git infra
                        '''
                    }
                }
            }
        }


        stage('ArgoCD Sync') {
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
            cleanWs()
        }
    }
}
