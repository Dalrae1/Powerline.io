# About

Powerline.io server emulator made in Node.js, as well as the client implementation for a server selector.

This is still in development, and as such does include some odd bugs.

This will emulate all of Powerline.io's game functionality that is in the main server, as well as various fixes ralated to known bugs in the main server.

Known bugs that are fixed:
- U-turn when server lags
- ping is taken into account with all moves, which will fix most lag-related issues

# Setting up the server locally

In order to run the server on your own PC, you need a few things:
- nodejs
- php
- apache
- mysql
- a discord application
- composer

First things first, you need to rename `example.servers.json` to `servers.json` and `example.env` to `.env`.

## Some info first

Servers defined in `servers.json` are servers created by you (who is running the powerline.io server); servers defined in the database are created by users.

`.env` is a configuration file that is important to be hidden; you need to update it.

If you are connected from web via an http connection, please note that `setcookie()` used by `login-handler.php` needs its `$secure` parameter set to false.

The following are some steps to set up everything you need; they are very simplified.

## Database

You need to create the database using mysql/mariadb. Also create a user that has full access to this database. Don't forget to update `.env`.

In this database create the following tables:
```sql
CREATE TABLE `servers` (
  `id` int NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `owner` int DEFAULT NULL,
  `pinned` tinyint NOT NULL DEFAULT '0',
  `maxplayers` int NOT NULL,
  `config` json DEFAULT NULL,
  PRIMARY KEY (`id`)
);
CREATE TABLE `sessions` (
  `session` varchar(30) NOT NULL,
  `userid` int DEFAULT NULL,
  PRIMARY KEY (`session`)
);
CREATE TABLE `users` (
  `userid` int NOT NULL AUTO_INCREMENT,
  `username` varchar(30) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `rank` int NOT NULL DEFAULT '0',
  `pfp` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`userid`)
);
```

## Discord integration

You need to create a discord app from the discord developer portal in order to enable discord ouath. The ouath needs to redirect to `yourhost/login-handler.php`. It needs the 'identify' and 'email' scopes.

Don't forget to update `.env`. Also don't forget to update the url to which users will be ouath logging. Search for `let url = ` in `index.html` and update it.

## Apache + PHP

You need to update the apache config file.

Firstly, you **may** need to load the MPM prefork module instead of MPM event module (the default). Comment the other module and uncomment the prefork one (search for `LoadModule mpm_prefork_module modules/mod_mpm_prefork.so`).

Secondly, if you are not on Windows, you should either put yourself as the user that is running the apache/httpd process, or give the default user/group (httpd) permission to access all the files inside /webserver.

Next, update the root folder to point to /webserver (search for `DocumentRoot` and `<Directory`).

Lastly, enable PHP execution — put these at their right place: `LoadModule php_module modules/libphp.so`, `AddHandler php-script .php` and `Include conf/extra/php_module.conf`. You may need to install a different package for this, depending on your OS (on Arch Linux you need `php-apache` for example).

Enable `mysqli` in PHP: go to the PHP config file (`php.ini`) and uncomment this line `extension=mysqli`.

## Composer

You need composer in order to run `vlucas/phpdotenv`. After you installed it, run the command `composer install`.

## Starting the server

You should be ready to start up the server. First make sure the mysql process is open so you can process db requests. Then turn on the powerline server via `node PowerlineServer.js`, and then you can turn on the apache server, after which you should be able to play powerline.