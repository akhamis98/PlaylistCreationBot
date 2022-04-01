// This version of the bot uses env vars to get token, clientId, and spotifyToken
// It is expected to have some REST endpoints where users can go to and login to spotify
// TODO: set bearer tokens in a DB by discord userId, and then keep their refreshTokens for later
// TOD: get spotify usernames through discord API (connections) https://discord.com/developers/docs/topics/oauth2
//       -need to Oauth for discord per user for this

var Discord = require('discord.js');
var express = require('express');
var logger = require('winston');
//auth.json or env vars should have params "auth" and "spotifyAuth" for the discord bot and spotify api respectively
var auth = process.env;
const userMap = new Map();


let XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
let tokenRequest = new XMLHttpRequest();
let playlistRequest = new XMLHttpRequest();
var bearerToken = null;
var discordUser = null;
let playlistHref = "";
let playlistUrl = "";
let request = new XMLHttpRequest();
let spotifyToken;
let spotifyAuthExpirationTime = 0;
//regex will match if the embed has the form "TRACK Single by ARTIST" or "ALBUM by ARTIST"
let appleMusicRegex = /(.+) \- Single by (.*)|(.+) by (.*)|(.+) \- EP by (.*)/
//regex will extract the number of songs in an embed
let songNumberRegex = /.*([\d]+) Song.*/


// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console, {
    colorize: true
});
logger.level = 'debug';


function generateRandomString(length) {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * 
 charactersLength));
   }
   return result;
}
var redirect_uri = 'https://lemon-pretty-typhoon.glitch.me/callback';
var app = express();
var port = 8888;

app.get('/callback', function(req, res) {

  var code = req.query.code || null;
  var state = req.query.state || null;
  logger.info("in callback");
  if (state === null) {
    res.redirect('/#');
  } else {
    getSpotifyAuthToken(req);
    res.sendfile('authed.html');
  }
  
});

function askForUserAuth(message) {
  bot.channels.cache.get(message.channel.id).send("Please authorize me to create a playlist for your user " +
                                                  "https://lemon-pretty-typhoon.glitch.me" );
}
app.get('/', function(req, res) {
  logger.info("getting user auth from spotify")
  var state = generateRandomString(16);
  logger.info("id: " + auth.clientId.substring(3));
  res.redirect('https://accounts.spotify.com/authorize?' + "response_type=code&client_id=" + auth.clientId + "&scope=playlist-modify-public playlist-modify-private&redirect_uri=" + redirect_uri + "&state=" + state );
});

app.listen(port, function() {
  logger.info(`Example app listening on port ${port}!`)
});

//spotify auth token generation code
function getSpotifyAuthToken(req) {
    logger.info("Auth expired, getting new auth");
    tokenRequest = new XMLHttpRequest();
    tokenRequest.open('POST', "https://accounts.spotify.com/api/token", false);
    tokenRequest.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    tokenRequest.setRequestHeader("Authorization", "Basic " + new Buffer(auth.spotifyAuth).toString("base64"));
    tokenRequest.onload = function() {
        // Begin accessing JSON data here
        if (tokenRequest.readyState == 4) {
            logger.info("Getting auth token from Spotify");
            var data = JSON.parse(this.responseText);
            //if a success (this should be done better), set the new spotify token and update the expiration time
            if (tokenRequest.status >= 200 && tokenRequest.status < 400) {
                if (req) {
                  bearerToken = data.access_token;
                  logger.info("Set bearer token as " + bearerToken);
                }
                else {
                  spotifyToken = data.access_token;
                  spotifyAuthExpirationTime = Date.now() - 1000 + data.expires_in*1000;
                  logger.info("Set spotify token as " + data.access_token + " expires at " + spotifyAuthExpirationTime);
                }
                
            } else {
                logger.error("unexpected response from spotify API, status = " + tokenRequest.status + " response = " + this.responseText);
            }
        }
    }
    if (req) {
      tokenRequest.send("grant_type=authorization_code&code=" + req.query.code + "&redirect_uri=" + redirect_uri)
    }
    else {
      tokenRequest.send(encodeURIComponent("grant_type") + "=" + encodeURIComponent("client_credentials"));
    }
    
}

function addToSpotifyPlaylist(playlistUrl, uri_arr) {
    var endpoint = playlistUrl + "/tracks?uris=";
    var queryParams="";
    for (let i = 0; i < uri_arr.length; i++) {
        queryParams = queryParams + "spotify:track:" + uri_arr[i] + ",";
        
    }
    queryParams = queryParams.substring(0, queryParams.length-1);
    var req = new XMLHttpRequest();
    req.open('POST', endpoint + encodeURIComponent(queryParams), false);
    req.setRequestHeader("Content-Type", "application/json");
    //get user bearer token from here https://developer.spotify.com/console/post-playlist-tracks/
    req.setRequestHeader("Authorization", "Bearer " + bearerToken);
    req.onload = function() { 
        // Begin accessing JSON data here
        if (req.readyState == 4) {
            logger.info("Creating spotify playlist");
            var data = JSON.parse(this.responseText);
            //if a success (this should be done better), set the new spotify token and update the expiration time
            if (req.status >= 200 && req.status < 400) {
                logger.info("Added to playlist, status = " + req.status);
                //bearerToken = null;
                //logger.info("Reset bearerToken");
            } else {
                logger.error("unexpected response from spotify API, status = " + playlistRequest.status + " response = " + this.responseText);
            }
        }
    }
    logger.info("request = " + req);
    req.send(null);
}

function createSpotifyPlaylist(message, spotify_user, uri_arr) {
    var name = message.channel.name + " playlist (" + (new Date()).toISOString().slice(0,10).replace(/-/g,"") + ")";
    var description = "";
    logger.info("Creating playlist");
    playlistRequest = new XMLHttpRequest();
    playlistRequest.open('POST', "https://api.spotify.com/v1/users/" + spotify_user + "/playlists", false);
    playlistRequest.setRequestHeader("Content-Type", "application/json");
    playlistRequest.setRequestHeader("Authorization", "Bearer " + bearerToken);
    const json = {
        "name": name,
        "description": description,
        "public": true
    };
    playlistRequest.onload = function() { 
        // Begin accessing JSON data here
        if (playlistRequest.readyState == 4) {
            logger.info("Creating spotify playlist");
            logger.info("bearerToken = " + bearerToken);
            var data = JSON.parse(this.responseText);
            //if a success (this should be done better), set the new spotify token and update the expiration time
            if (playlistRequest.status >= 200 && playlistRequest.status < 400) {
                logger.info("href: " + data.href);
                playlistHref = data.href;
                playlistUrl = data.external_urls.spotify;
                var batch = 10;
                logger.info("uri_arr.length " + uri_arr.length);
                for (var i=0; i<uri_arr.length; i+=batch) {
                     logger.info("Batching: i=" + i)
                     addToSpotifyPlaylist(data.href, uri_arr.slice(i,i+batch));
                }
                //addToSpotifyPlaylist(data.href, uri_arr);
            } else {
                logger.error("unexpected response from spotify API, status = " + playlistRequest.status + " response = " + this.responseText);
                bot.channels.cache.get(message.channel.id).send(JSON.stringify(data.error.message));
            }
        }
    }
    playlistRequest.send(JSON.stringify(json));
}

// Initialize Discord Bot
var bot = new Discord.Client({
   token: auth.token,
   autorun: true
});
bot.login(auth.token);
bot.on('ready', function (evt) {
    logger.info('Connected');
    logger.info('Logged in as: ');
    logger.info(bot.username + ' - (' + bot.id + ')');
});

function convert_apple_embed_to_spotify_links(message, callback) {
    embed = message.embeds[0];
    //if our spotify api token is expired, get a new one
    if (Date.now() >= spotifyAuthExpirationTime) {
        getSpotifyAuthToken();
    }
    //match song name and author name from regex defined at top of file
    var arr = null; 
    try {
      arr = embed.title.match(appleMusicRegex);
    }
    catch (error) {
      logger.error("Embed is null (message content: " + message.content + ")", error);
      return null;
    }
    logger.info(arr);
    //encode for URI
    var searchTitle;
    //single case
    if (arr == null) {
        return null;
    }
    if (arr[1] != null) {
        searchTitle = encodeURIComponent(arr[2] + " " + arr[1]);
    }
    //album case
    else if (arr[3] != null) {
        searchTitle = encodeURIComponent(arr[4] + " " + arr[3]);
    }
    //EP case
    else {
        searchTitle = encodeURIComponent(arr[6] + " " + arr[5]);
    }
    //query spotify api for the song/album and artist for albums and tracks
    //logger.info("Searching for track " + arr);
    request = new XMLHttpRequest();
    request.open('GET', "https://api.spotify.com/v1/search?q=" + searchTitle + "&type=track", false);
    //logger.info("URL = " + "https://api.spotify.com/v1/search?q=" + searchTitle + "&type=track");
    //set our token
    request.setRequestHeader("Authorization", "Bearer " + spotifyToken);
    request.onload = function() {
        // Begin accessing JSON data here
        // parse for spotify url
        var data = JSON.parse(this.responseText);
        if (request.status >= 200 && request.status < 400) {
            //try to get spotify url, log if it can't get it
            try {
                //logger.info("get spotify url " + data.tracks.items[0].external_urls.spotify);
                callback(data.tracks.items[0].external_urls.spotify);
            }
            catch(err) {
                logger.error(err.message);
            }
        } else {
            logger.error("Error when getting song info from spotify using token " + spotifyToken + ", response = " + this.responseText);
        }
    }
        
    request.send();
    

}

async function get_messages(channel, timestamp) {
    const sum_messages = [];
    let last_id;
    var my_limit = 50;

    while (true) {
        const options = { limit: my_limit };
        if (last_id) {
            options.before = last_id;
        }

        // const messages = await channel.fetchMessages(options); //try channel.messages.fetch
        const messages = await channel.messages.fetch(options);
        sum_messages.push(...messages.array());
        last_id = messages.last().id;
        if (messages.size != my_limit || messages.last().createdTimestamp < timestamp) {
            break;
        }
    }

    return sum_messages;
}

async function get_playlist(message) {
    if (Date.now() >= spotifyAuthExpirationTime) {
        getSpotifyAuthToken();
    }
    var arguments = message.content.split(" ");
    if (arguments.length < 4) {
        //return error and break
        bot.channels.cache.get(message.channel.id).send("Usage: !7get {spotify_username} {num} {days/weeks}");
        return;
    }
    else {
        var timeDiff = 0;
        if (arguments[3] == "week" || arguments[3] == "weeks" || arguments[3] == "w") {
            timeDiff = 7*24*60*60*1000;
        }
        else if (arguments[3] == "day" || arguments[3] == "days" || arguments[3] == "d") {
            timeDiff = 24*60*60*1000;
        }
        else {
          bot.channels.cache.get(message.channel.id).send("Usage: !7get {spotify_username} {num} {days/weeks}");
          return;
        }
        timeDiff = parseInt(arguments[2]) * timeDiff;
        var timestamp = Date.now() - timeDiff;
        logger.info("current date = " + Date.now());
        logger.info("timestamp = " + timestamp);
        var msg_arr = await get_messages(bot.channels.cache.get(message.channel.id), timestamp);
        var uri_arr = [];
        for (let i = 0; i < msg_arr.length; i++) {
            if (msg_arr[i].createdTimestamp > timestamp && (msg_arr[i].content.includes("open.spotify.com/track") || msg_arr[i].content.includes("music.apple.com"))) {
                //logger.info("Adding song " + msg_arr[i].content + " - " + ((Date.now() - msg_arr[i].createdTimestamp)/1000/60/60/24) + " days old");

                var spotifyLink = msg_arr[i].content;
                if (msg_arr[i].content.includes("music.apple.com")) {
                    convert_apple_embed_to_spotify_links(msg_arr[i], function(link){
                        spotifyLink = link;
                      });
                    logger.info("spotifyLink:" + spotifyLink);
                }
                if (spotifyLink == null) {
                    continue;
                }
                const regex = /.*open.spotify.com\/track\/([a-zA-Z0-9]+).*/;
                const uri = regex.exec(spotifyLink);
                if (uri) {
                    uri_arr.push(uri[1]);
                }

            }
        }
      
        createSpotifyPlaylist(message, arguments[1], uri_arr);
        bot.channels.cache.get(message.channel.id).send(playlistUrl);
    }
}


bot.on('message', message => { 
    //if its an apple music link, convert to spotify link
    if (message.content.includes("!7get") && !message.author.bot) {
        logger.info("bearerToken = " + bearerToken);
        
        if (bearerToken == null) {
          askForUserAuth(message);
        }
        else {
          logger.info("user: " + message.author)
          get_playlist(message);
        }
    }
  if (message.content.includes("!7setSpotifyUser")) {
      logger.info("authro info " + message.author.presence.activities);
      askForUserAuth(message);
  }

 }
);
