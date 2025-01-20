docker stop httplog
docker rm httplog
docker run -d --name httplog -p 4646:3000 httplog