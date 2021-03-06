![logo](https://raw.githubusercontent.com/yafp/ttth/master/.github/images/logo/128x128.png)


# ttth
## Contributing


### general
When contributing to this repository, please first discuss the change you wish to make via issue,
email, or any other method with the owners of this repository before making a change.

### jsdocs
A documentation of all ttth specific js code is located in ```/docs/jsdocs```.

### CI
The project repository is using:

* [Travis CI](https://travis-ci.org/) (for Linux and macOS)
* [AppVeyor](https://ci.appveyor.com/project/yafp/ttth) (for Windows)

for Continuos Integration aspects.

### Building ttth
Build instructions can be found [here](BUILD.md).

### Sentry (Crashreports)
Crashreport informations are located [here](https://sentry.io/organizations/yafp/ttth).


### Getting started

#### 1. First steps

##### Clone repo
* Clone the repository: ```git clone https://github.com/yafp/ttth```

##### Install dependencies
* Go into the repository: ```cd ttth```
* Install dependencies: ```npm install```

##### Run the code
* Execute: ```npm start```


##### Run the code with debug logging
* Execute ```npm run start-debug```


##### Run the code with verbose output
* Execute: ```npm start-verbose```


##### Run some basic test
* Execute: ```npm test```


#### 2. Adding functions

##### adding a new service
* Edit ```app/js/ttth/services.json``` and add the new service
* Check the function ```loadServiceSpecificCode``` in ```/app/js/ttth/renderer.js```

##### other modification or changes
* ....




#### 3. Misc howto's

##### Auditing

###### npm auditing (scan for vulnerabilities)
* ```npm audit```

##### Install packages

###### install single package
* ```npm install PACKAGENAME --save```

###### npm: install single package in specific version
* ```npm install PACKAGENAME@1.2.3```


##### Outdated packages

###### check for outdated npm packages
* ```npm outdated```

or using ```npm-check```:

* Install requirements: ```npm install -g npm-check```
* Run check: ```npm-check```


##### Updating

###### check dependencies
* Install requirements: ```npm install depcheck```
* Run check: ```depcheck```

###### update single package
* ```npm install PACKAGENAME --save```

###### update all packages
* ```npm update```



##### Others
###### List all package.json scripts
* ```npm run```

or a dynamic solution

* Install requirements: ```npm i -g ntl```
* Execute ```ntl```
