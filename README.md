# PlaylistCreationBot

This discord bot allows users to generate a spotify playlist under their own account, based on the spotify or apply music songs linked in the channel for the past amount of time. 

## Usage

Currently this discord bot is activated by !7setSpotifyUser, this sends a link for the user to OAuth with their Spotify account.

Then the user can use "!7get {spotify_username} {num} {days/weeks}" to generate a spotify playlist

## Notes

Env vars expects 'token' (for the discord bot) and 'spotifyAuth' (from the spotify dev API page)

## TODO

TODO: set spotify bearer tokens in a DB by discord userId, and then keep their refreshTokens for later (can refresh them easily)
TODO: get spotify usernames through discord API (connections) https://discord.com/developers/docs/topics/oauth2
       -need to Oauth for discord per user for this
