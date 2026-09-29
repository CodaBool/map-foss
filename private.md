# TODO
- click listener cancelled bug
- ensure limit windows to 1 for several UI windows
- create and expose api macros
- simple-quest integration
- allow territory / linestring to have Foundry links

# Release
1. push to main
2. git tag -a v0.0.1 -m ""
3. git push -u origin v0.0.1
4. watch [actions](https://github.com/CodaBool/map-foss/actions)
7. verify installation with a foundry docker locally
8. https://foundryvtt.com/packages/map/edit

# Updating Foundry Rich Editor
1. https://onlinehtmleditor.dev
2. https://markdowntohtml.com


# db
> reset

game.settings.set("map", "maps", { meta: {default: ""}})
