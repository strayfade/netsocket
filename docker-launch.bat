docker build -t netsocket .
docker run -e HOSTNAME="0.0.0.0" -e PORT="4675" -p 4675:4675 -e DATA_DIR=/netsocket/data -v netsocket-data:/netsocket/data netsocket 
