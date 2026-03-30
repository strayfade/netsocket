# netsocket

Netsocket is a deeply-integrated, expandable nodegraph editor for creating automations.

# Usage

### Docker
- Image: [strayfade/netsocket](https://hub.docker.com/repository/docker/strayfade/netsocket/general)
- Run from command line:
```
docker run -p 3000:4675 strayfade/netsocket
```
- `compose.yaml`
```yaml
version: "3.8"
services:
  netsocket:
    image: strayfade/netsocket:latest
    container_name: netsocket
    ports:
      - 3000:4675
    environment:
      - PORT=4675
      - HOST=0.0.0.0
    restart: always
```
- Go to [http://localhost:3000](http://localhost:3000).

### Node.js
- Clone netsocket and install dependencies
```
git clone https://github.com/strayfade/netsocket
cd netsocket
npm install
```
- Run netsocket
```
npm start
```
- Go to [http://localhost:4675](http://localhost:4675).

### After installing...
- Create a username/password by navigating to the homepage
- Create your first automation