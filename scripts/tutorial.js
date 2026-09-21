/* @license 2026 CodaBool all rights reserved */

import { STARGAZER_URL } from "./util.js"

export const dev = window.navigator.platform === "Linux x86_64" && window.location.port === "300" && window.location.hostname === "localhost"

Hooks.once("ready", () => {
  // create hidden folder if it doesn't exist
  const j = game.journal._source.filter(f => f.name === "use this for stargazer map linking")
  if (j.length === 0) {
    JournalEntry.create({
      name: "use this for stargazer map linking",
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER }
    })
  }

  // you're probably not CodaBool
  if (!dev) {
    registerTours();


    if (!game.user.isGM) return
    // new module message. Remove after entering v1.0.0
    function listen() {
      document.querySelector("#stargazer-check")?.addEventListener("change", e => {
        if (e.target.checked) {
          localStorage.setItem("stargazer-skip", "true")
        } else {
          localStorage.removeItem("stargazer-skip")
        }
      })
    }

    if (game.settings.get("map", "proxy") === "https://stargazer.vercel.app") {
      game.settings.set("map", "proxy", STARGAZER_URL)
    }

    const hasPreviousMessage = game.messages.contents.some(msg => {
      return msg.speaker.alias === "CodaBool" && msg.title === "Stargazer";
    })
    if (hasPreviousMessage || localStorage.getItem("stargazer-skip")) {
      setTimeout(() => {
        listen()
      }, 1_200)
      return
    }

    ChatMessage.create({
      speaker: { alias: "CodaBool" },
      title: "Stargazer",
      whisper: [game.user.id],
      content: `
      <div style="font-size: 1.2em">
        <h3 style="font-size: 1.5em">Welcome stargazers</h3>
        <p>Thanks for your purchase!</p>
        <p>This module is new and you may encounter some bugs. I will be actively working on resolving all issues as they come in.</p>
        <p>If you would like to contribute to reporting bugs there is a feedback tool directly in Foundry. There are also other methods mentioned within the feedback window.</p>
        <p>Thank you for your support and happy stargazing!</p>
        <div style="text-align: center">
          <input type='checkbox' id="stargazer-check" name="dontShowAgain"/>
          <label for="dontShowAgain">
            don't show this again
          </label>
        </div>
      </div>
      `,
    }).then(r => {
      setTimeout(() => {
        listen()
      }, 1_200)
    })
  }
})


// tutorial
function registerTours() {
  game.tours.register("map", "map-manager", new Tour({
    title: "map.tours.map-manager.title", // [readable name]
    restricted: true, // defaults false [for GM only if true]
    description: "map.tours.map-manager.description",
    // canBeResumed: true, // defaults false
    display: true, // defaults false
    steps: [
      {
        id: "1",
        title: "map.tours.map-manager.1.title",
        content: "map.tours.map-manager.1.content",
        selector: ".map-manager",
        // layer: "",
      },
    ]
  }))
  game.tours.register("map", "generate-scene", new Tour({
    title: "map.tours.generate-scene.title", // [readable name]
    restricted: true, // defaults false [for GM only if true]
    description: "map.tours.generate-scene.description",
    // canBeResumed: true, // defaults false
    display: true, // defaults false
    steps: [
      {
        id: "1",
        title: "map.tours.generate-scene.1.title",
        content: "map.tours.generate-scene.1.content",
        selector: ".map-generate-scene",
        // layer: "",
      },
    ]
  }))
}
