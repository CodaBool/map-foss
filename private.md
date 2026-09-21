# TODO
- click listener cancelled bug
- ensure limit windows to 1 for several UI windows
- create and expose api macros
- simple-quest integration
- allow territory / linestring to have Foundry links

# Test
```sh
cp module.json module.backup.json
jq 'del(.protected) | .manifest = "https://d3erver.codabool.workers.dev/manifest?secret=REDACTED&module=map&beta=true"' module.json  > temp_file && mv temp_file module.json
zip -r map.zip .
bunx wrangler r2 object put module/map-v0.0.0 -f map.zip --ct application/zip --cc public
mv module.backup.json module.json
rm map.zip
```

https://d3erver.codabool.workers.dev/manifest?secret=REDACTED&module=map&beta=true

# Release
1. push to main
2. git tag -a v0.0.1 -m ""
3. git push -u origin v0.0.1
4. watch [actions](https://github.com/CodaBool/map-foss/actions)
7. verify installation with a foundry docker locally
8. https://foundryvtt.com/packages/map/edit

# Replace Last Release
1. delete [public release](https://github.com/CodaBool/map-foss/releases)
2. delete [private tag](https://github.com/CodaBool/map-foss/tags)
3. delete local tag `git tag -d v0.0.1`
4. delete [foundry release](https://foundryvtt.com/packages/map/edit)
5. do a normal tagged release now

# Updating Foundry Rich Editor
1. https://onlinehtmleditor.dev
2. https://markdowntohtml.com


# db
> reset

game.settings.set("map", "maps", { meta: {default: ""}})
