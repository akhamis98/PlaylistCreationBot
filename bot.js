// can run like nodemon --inspect bot.js
var Discord = require('discord.js');
var logger = require('winston');
//auth.json should have params "auth" and "spotifyAuth" for the discord bot and spotify api respectively
var auth = require('./auth.json');
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
var tokenRequest = new XMLHttpRequest();
var request = new XMLHttpRequest();
var spotifyToken;
var spotifyAuthExpirationTime;
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
tokenRequest.open('POST', "https://accounts.spotify.com/api/token", false);
tokenRequest.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
tokenRequest.setRequestHeader("Authorization", "Basic " + new Buffer(auth.spotifyAuth).toString("base64"));
//get our spotify api token using our authentication from the spotify API site
tokenRequest.onload = function() {
    // Begin accessing JSON data here
    if (tokenRequest.readyState == 4) {
        logger.info("Getting auth token from Spotify");
        var data = JSON.parse(this.responseText)
        //if a success (this should be done better), set the new spotify token and update the expiration time
        if (tokenRequest.status >= 200 && tokenRequest.status < 400) {
            logger.info("Set spotify token as " + data.access_token + " expires in " + data.expires_in);
            spotifyToken = data.access_token;
            spotifyAuthExpirationTime = new Date().getUTCSeconds + data.expires_in;
        } else {
        console.log('error')
        }
    }
    
}
logger.info("Send request");
tokenRequest.send(encodeURIComponent("grant_type") + "=" + encodeURIComponent("client_credentials"));

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
bot.on('message', message => {
    //if our spotify api token is expired, get a new one
    if (new Date().getUTCSeconds >= spotifyAuthExpirationTime) {
        tokenRequest.send(encodeURIComponent("grant_type") + "=" + encodeURIComponent("client_credentials"));
    }
    //if its an apple music link, convert to spotify link
    if (message.content.includes("music.apple.com")) {
        message.embeds.forEach( embed => {
            //read song title and artist name(s) from the embed
            logger.info("embed = " + embed.title);
            logger.info("description = " +embed.description);
            //match song name and author name from regex defined at top of file
            var arr = embed.title.match(appleMusicRegex);
            logger.info(arr);
            //encode for URI
            var searchTitle;
            //single case
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
            
            logger.info("Searching for track " + arr);
            //query for the embed info for albums and tracks
            request.open('GET', "https://api.spotify.com/v1/search?q=" + searchTitle + "&type=album,track", true);
            logger.info("URL = " + "https://api.spotify.com/v1/search?q=" + searchTitle + "&type=album,track");
            //set our token
            request.setRequestHeader("Authorization", "Bearer " + spotifyToken);
            request.onload = function() {
                // Begin accessing JSON data here
                // parse for spotify url
                var data = JSON.parse(this.responseText);
                if (request.status >= 200 && request.status < 400) {
                    //try to get spotify url, log if it can't get it
                    try {
                        //since AM embeds don't actually contain accurated info if something is a single or an album
                        //we instead check the song number, then query for that for our spotify link (shorter embeds when possible)
                        logger.info(embed.description);
                        if (parseInt(embed.description.match(songNumberRegex)[1], 10) == 1) {
                            bot.channels.cache.get(message.channel.id).send(data.tracks.items[0].external_urls.spotify);
                        }
                        else {
                            bot.channels.cache.get(message.channel.id).send(data.albums.items[0].external_urls.spotify);
                        }
                    }
                    catch(err) {
                        logger.error(err.message);
                    }
                } else {
                  console.log('error')
                }
            }
              
            request.send()
        })
        
     }
 }
);
