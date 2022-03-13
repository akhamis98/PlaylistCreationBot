// can run like nodemon --inspect bot.js
var Discord = require('discord.js');
var logger = require('winston');
//auth.json should have params "auth" and "spotifyAuth" for the discord bot and spotify api respectively
var auth = require('./auth.json');


let XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
let tokenRequest = new XMLHttpRequest();
let playlistRequest = new XMLHttpRequest();
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

//spotify auth token generation code
function getSpotifyAuthToken() {
    logger.info("Auth expired, getting new auth");
    tokenRequest = new XMLHttpRequest();
    tokenRequest.open('POST', "https://accounts.spotify.com/api/token", false);
    tokenRequest.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    tokenRequest.setRequestHeader("Authorization", "Basic " + new Buffer(auth.spotifyAuth).toString("base64"));
    tokenRequest.onload = function() {
        // Begin accessing JSON data here
        if (tokenRequest.readyState == 4) {
            logger.info("Getting auth token from Spotify");
            logger.info("this.responseText = " + this.responseText);
            var data = JSON.parse(this.responseText);
            //if a success (this should be done better), set the new spotify token and update the expiration time
            if (tokenRequest.status >= 200 && tokenRequest.status < 400) {
                spotifyToken = data.access_token;
                spotifyAuthExpirationTime = Date.now() - 1000 + data.expires_in*1000;
                logger.info("Set spotify token as " + data.access_token + " expires at " + spotifyAuthExpirationTime);
            } else {
                logger.error("unexpected response from spotify API, status = " + tokenRequest.status + " response = " + this.responseText);
            }
        }
    }
    tokenRequest.send(encodeURIComponent("grant_type") + "=" + encodeURIComponent("client_credentials"));
}

function addToSpotifyPlaylist(playlistUrl, uri_arr) {
    var endpoint = playlistUrl + "/tracks?uris=";
    var queryParams="";
    for (let i = 0; i < uri_arr.length; i++) {
        queryParams = queryParams + "spotify:track:" + uri_arr[i] + ",";
        
    }
    queryParams = queryParams.substring(0, queryParams.length-1);
    logger.info("uriString = " + endpoint);
    var req = new XMLHttpRequest();
    req.open('POST', endpoint + encodeURIComponent(queryParams), false);
    req.setRequestHeader("Content-Type", "application/json");
    //get user bearer token from here https://developer.spotify.com/console/post-playlist-tracks/
    req.setRequestHeader("Authorization", "Bearer " + auth.oAuthToken);
    req.onload = function() { 
        // Begin accessing JSON data here
        if (req.readyState == 4) {
            logger.info("Creating spotify playlist");
            var data = JSON.parse(this.responseText);
            //if a success (this should be done better), set the new spotify token and update the expiration time
            if (req.status >= 200 && req.status < 400) {
                logger.info("Added to playlist, status = " + req.status);
            } else {
                logger.error("unexpected response from spotify API, status = " + playlistRequest.status + " response = " + this.responseText);
            }
        }
    }
    logger.info("request = " + req);
    req.send(null);
}

function createSpotifyPlaylist(name, description, uri_arr) {
    logger.info("Creating playlist");
    playlistRequest = new XMLHttpRequest();
    playlistRequest.open('POST', "https://api.spotify.com/v1/users/picklezzhd/playlists", false);
    playlistRequest.setRequestHeader("Content-Type", "application/json");
    playlistRequest.setRequestHeader("Authorization", "Bearer " + auth.oAuthToken);
    const json = {
        "name": name,
        "description": description,
        "public": true
    };
    playlistRequest.onload = function() { 
        // Begin accessing JSON data here
        if (playlistRequest.readyState == 4) {
            logger.info("Creating spotify playlist");
            var data = JSON.parse(this.responseText);
            //if a success (this should be done better), set the new spotify token and update the expiration time
            if (playlistRequest.status >= 200 && playlistRequest.status < 400) {
                logger.info("href: " + data.href);
                playlistHref = data.href;
                playlistUrl = data.external_urls.spotify;
                addToSpotifyPlaylist(data.href, uri_arr);
            } else {
                logger.error("unexpected response from spotify API, status = " + playlistRequest.status + " response = " + this.responseText);
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
    logger.info("called convert_apple_embed_to_spotify_links + " + message.embeds[0].title);
    embed = message.embeds[0];
    //if our spotify api token is expired, get a new one
    if (Date.now() >= spotifyAuthExpirationTime) {
        getSpotifyAuthToken();
    }
    logger.info("Current time = " + Date.now() + ", spotifyAuthExpirationTime = " + spotifyAuthExpirationTime);
    //read song title and artist name(s) from the embed
    logger.info("embed = " + embed.title);
    logger.info("description = " +embed.description);
    //match song name and author name from regex defined at top of file
    var arr = embed.title.match(appleMusicRegex);
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
    logger.info("Searching for track " + arr);
    request = new XMLHttpRequest();
    request.open('GET', "https://api.spotify.com/v1/search?q=" + searchTitle + "&type=track", false);
    logger.info("URL = " + "https://api.spotify.com/v1/search?q=" + searchTitle + "&type=track");
    //set our token
    request.setRequestHeader("Authorization", "Bearer " + spotifyToken);
    request.onload = function() {
        // Begin accessing JSON data here
        // parse for spotify url
        var data = JSON.parse(this.responseText);
        if (request.status >= 200 && request.status < 400) {
            //try to get spotify url, log if it can't get it
            try {
                // //since AM embeds don't actually contain accurated info if something is a single or an album
                // //we instead check the song number, then query for that for our spotify link (shorter embeds when possible)
                // logger.info(embed.description);
                // //null catches the case of Song - LENGTH - YYYY
                // if (embed.description.match(songNumberRegex) == null || parseInt(embed.description.match(songNumberRegex)[1], 10) == 1) {
                //     data.tracks.items[0].external_urls.spotify;
                // }
                // else {
                //     data.albums.items[0].external_urls.spotify;
                // }
                logger.info("get spotify url " + data.tracks.items[0].external_urls.spotify);
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
    var my_limit = 10;

    while (true) {
        const options = { limit: my_limit };
        if (last_id) {
            options.before = last_id;
        }

        // const messages = await channel.fetchMessages(options); //try channel.messages.fetch
        const messages = await channel.messages.fetch(options);
        sum_messages.push(...messages.array());
        last_id = messages.last().id;
        logger.info("messages: " + messages.last().content);
        if (messages.size != my_limit || messages.last().createdTimestamp < timestamp) {
            logger.info("breaking: (message timstamp:" + messages.last().createdTimestamp + ")");
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
    if (arguments.length < 3) {
        //return error and break
    }
    else {
        var timeDiff = 0;
        if (arguments[2] == "week" || arguments[2] == "weeks" || arguments[2] == "w") {
            timeDiff = 7*24*60*60*1000;
            logger.info("weeks ");
        }
        else if (arguments[2] == "day" || arguments[2] == "days" || arguments[2] == "d") {
            timeDiff = 24*60*60*1000;
            logger.info("days ");
        }
        timeDiff = parseInt(arguments[1]) * timeDiff;
        var timestamp = Date.now() - timeDiff;
        logger.info("current date = " + Date.now());
        logger.info("timestamp = " + timestamp);
        var msg_arr = await get_messages(bot.channels.cache.get(message.channel.id), timestamp);
        var uri_arr = [];
        for (let i = 0; i < msg_arr.length; i++) {
            if (msg_arr[i].createdTimestamp > timestamp && (msg_arr[i].content.includes("open.spotify.com/track") || msg_arr[i].content.includes("music.apple.com"))) {
                logger.info("Adding song " + msg_arr[i].content + " - " + ((Date.now() - msg_arr[i].createdTimestamp)/1000/60/60/24) + " days old");

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
        createSpotifyPlaylist(message.channel.name + " playlist (" + (new Date()).toISOString().slice(0,10).replace(/-/g,"") + ")", "", uri_arr);
        bot.channels.cache.get(message.channel.id).send(playlistUrl);
    }
}


bot.on('message', message => { 
    //if its an apple music link, convert to spotify link
    if (message.content.includes("!7get")) {
        logger.info("user: " + message.author)
        get_playlist(message);
        
    }

 }
);
