# ReverserJS

# TODO:
- [ ] Convert the discord "bot" to typescript
- [ ] Convert the file type detector to typescript
- [ ] Convert the webm parser to typescript
- [ ] Convert the main file to typescript (www.js, I used an old template I made for websites and haven't gotten to this yet)
- [ ] Figure out a better way to login to DeviantArt
- [ ] Code cleanup

# Setup:
- Funny joke, this is the last thing on my priority list, but will happen at some point

Basics:
- Clone project
- `npm i`
- `npm run build` to build
- After building: `npm run start`

You are recommended to use [vscode](https://code.visualstudio.com/) with the [eslint extension](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) as it will alert you to rule breaking code in real time.

If you use vscode, and don't change the vscode workspace settings, the code will also be auto formatted based on the rules on file save. This can be disabled by setting the workspace setting from `"source.fixAll.eslint": "explicit"` to `"source.fixAll.eslint": "never"` if for whatever reason it's causing issues. This can be found in `.vscode/settings.json`