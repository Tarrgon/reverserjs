# ReverserJS

# TODO:
- [ ] Convert the discord "bot" to typescript
- [ ] Convert the file type detector to typescript
- [ ] Convert the webm parser to typescript
- [ ] Convert the main file to typescript (www.js, I used an old template I made for websites and haven't gotten to this yet)
- [ ] Figure out a better way to login to DeviantArt
- [ ] Code cleanup
- [ ] I'd like to make the Aggregators not exist as they are basically all the same and just move them all to the new Scraper classes and just have all the logic in the scraper class and make a single aggregator class that can interact with a new Scraper interface that exposes all the necessary methods.

# Setup:
- Funny joke, this is the last thing on my priority list, but will happen at some point

Basics:
- Clone project
- `npm i`
- `npm run build` to build
- After building: `npm run start`

You are recommended to use [vscode](https://code.visualstudio.com/) with the [eslint extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) as it will alert you to rule breaking code in real time.

If you use vscode, and don't change the vscode workspace settings, the code will also be auto formatted based on the rules on file save. This can be disabled by setting the workspace setting from `"source.fixAll.eslint": "explicit"` to `"source.fixAll.eslint": "never"` if for whatever reason it's causing issues. This can be found in `.vscode/settings.json`

Deviant art:
DA cannot be logged in to automatically due to aggressive captcha. However, this process only needs to be done once, and the refresh token is valid for 3 months, so as long as your app doesn't have more than 3 months of downtime, it should last forever, as refreshing it grants a new refresh token.
- [Make app](https://www.deviantart.com/developers/apps)
  - Make sure to set up a proper redirect url (should be `config.baseDomain` + `/deviantartcallback`)
- Authorize the app on your account
- Assuming the redirect URI is correct, the server will take care of the rest, which will consist of authorizing the code and saving the refresh token
- Restart reverser