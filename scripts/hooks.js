/* @license 2026 CodaBool all rights reserved */

import { IFrame, MapManager } from "./ui.js"
import { mapKey, STARGAZER_URL, injectedFunc, getPrettyTypeName, getLocations } from "./util.js"

Hooks.once("init", async () => {
  window.MapIFrame = IFrame

  const events = ["Note.prototype._onClickLeft2"]
  // const events = ["Note.prototype._onClickLeft2", "Note.prototype._onClickRight"]
  for (const eventName of events) {
    if (typeof libWrapper !== 'undefined') {
      // sometimes I see event not spread (libwrapper docs) but item-piles takes issue with it not being spread
      libWrapper.register("map", eventName, (wrapped, ...event) => {
        if (typeof wrapped !== "function") return
        let preventDefault = false
        try {
          preventDefault = injectedFunc(event[0], eventName)
        } catch (error) {
          console.error(error)
        }
        if (preventDefault) {
          return
        }
        return wrapped(...event)
      }, "MIXED")
    } else {
      const oldFunc = eval(eventName)
      const wrapper = (w, ...arg) => w(...arg)
      eval(`${eventName} = function (event) {
        let preventDefault = false
        try {
          preventDefault = injectedFunc(event, eventName)
        } catch(error) {
          console.error(error)
        }
        if (preventDefault) return
        return wrapper.call(this, oldFunc.bind(this), ...arguments);
      }`)
    }
  }

  game.settings.register("map", "maps", {
    scope: "world",
    type: Object,
    default: { meta: { default: "" } },
  })
  game.settings.register("map", "pointer", {
    scope: "world",
    restricted: true,
    type: String,
    default: "",
  })
  game.settings.register("map", "secret", {
    scope: "world",
    type: String,
    name: "map.settings.secretName",
    config: true,
    hint: "map.settings.secretHint",
    onChange: async value => {
      const response = await fetch(
        `${game.settings.get("map", "proxy")}/api/v1/map?secret=${value}`,
      )
      const data = await response.json()
      if (data.exists === true) {
        ui.notifications.info(`⭐ Stargazer connected, welcome ${data.name}`)
        foundry.applications.instances.forEach(app => {
          if (app.title === "Map Manager") app.render()
        })
      } else if (data.error !== "no secret") {
        ui.notifications.error(
          "Invalid secret provided. Please check your Stargazer Secret and try again.",
        )
      }
    },
  })
  game.settings.register("map", "folder", {
    scope: "world",
    type: String,
    name: "map.settings.folderName",
    default: "Generated Maps",
    config: true,
    hint: "map.settings.folderHint",
  })
  game.settings.register("map", "proxy", {
    scope: "world",
    type: String,
    name: "map.settings.proxyName",
    default: STARGAZER_URL,
    hint: `default ${STARGAZER_URL} see available @Forks.`,
    config: true,
  })
  game.keybindings.register("map", "map", {
    name: "map.settings.keybind",
    editable: [{ key: "KeyM" }],
    onDown: () => mapKey(),
  })
  Handlebars.registerHelper('or', (a, b) => a || b)

  game.socket.on("module.map", async data => {
    const gm = game.user.isGM && game.user.id === data.gid
    if (data.action === "notify") {
      if (data.uid) {
        if (game.user.id !== data.uid) return
      } else {
        if (!game.user.isGM) return
      }
      if (data.error) {
        ui.notifications.error(data.error, { permanent: data.perm || false })
      } else {
        ui.notifications.info(data.msg, { permanent: data.perm || false })
      }
    } else if (data.action === "setFlag") {
      if (!gm) return
      const doc = fromUuidSync(data.uuid)
      if (!doc) {
        ui.notifications.error(
          `Document '${data.uuid}' doesn't exist anymore. Could not set ${data.flag} to ${data.value}`,
        )
        return
      }
      tile.setFlag("map", data.flag, data.value)
    } else if (data.action === "openIframe") {
      const isOpen = Array.from(foundry.applications.instances.values()).some(
        a => a instanceof IFrame && a.uuid === data.uuid,
      )
      if (isOpen) return
      data.uids.forEach(uid => {
        if (game.user.id !== uid) return
        new IFrame(data.uuid).render(true)
      })
    }
  })

  // hide my journal
  Hooks.on('renderJournalDirectory', (app, htmlRaw) => {
    let html = htmlRaw
    if (game.release.generation === 12 || html?.length === 1) {
      html = html[0]
    }
    const j = game.journal._source.filter(f => f.name === "use this for stargazer map linking")
    if (j.length === 1) {
      const el = html.querySelector(`li[data-entry-id="${j[0]._id}"]`)
      if (el) el.remove()
    }
  });

  Hooks.on("canvasReady", async (scene, data, options, userId) => {
    // activate notes if mine exist
    const n = canvas.notes.placeables.some(n => n.document.flags.map?.generated)
    if (game.release.generation === 12) {
      const control = ui.controls.controls.find(c => c.name === "notes")
      const toggle = control?.tools?.find(c => c.name === "toggle")
      if (n && !toggle?.active) {
        canvas.notes.activate()
        toggle.onClick(true)
        canvas.tokens.activate()
      }
    } else {
      if (n && !ui.controls.controls.notes.tools.toggle.active) {
        // ui.controls.controls.notes.tools.toggle.active
        const active = ui.controls.activeControl || "tokens"
        canvas.notes.activate();
        ui.controls.activate({ toggles: { toggle: true } })
        ui.controls.activate({control: active})
        // game.settings.set('core', 'notesDisplayToggle', true)
      }

      // hide tooltip
      const el = document.querySelector("#map-location-tooltip")
      if (el && el?.style?.opacity === '1') {
        el.style.opacity = '0';
      }
    }
  })

  Hooks.on("renderSettingsConfig", (app, htmlRaw, data) => {
    let html = htmlRaw
    if (game.release.generation === 12 || html?.length === 1) {
      html = html[0]
    }
    const input = html.querySelector('input[name="map.secret"]')
    const text = input?.parentElement?.parentElement?.querySelector("p")
    if (text) {
      const anchor = document.createElement("a")
      anchor.href = `${game.settings.get("map", "proxy") || STARGAZER_URL}#settingsFoundry`
      anchor.target = "_blank"
      anchor.textContent = "Stargazer"
      console.log("replacing text", text.innerHTML)

      text.innerHTML = text.innerHTML.replace("@Stargazer", anchor.outerHTML)
    }

    const input2 = html.querySelector('input[name="map.proxy"]')
    const text2 = input2?.parentElement?.parentElement?.querySelector("p")
    if (text2) {
      const anchor = document.createElement("a")
      anchor.href = "https://github.com/CodaBool/stargazer/wiki/Forks"
      anchor.target = "_blank"
      anchor.textContent = "forks"
      text2.innerHTML = text2.innerHTML.replace("@Forks", anchor.outerHTML)
    }
  })

  Hooks.on("closeApplication", (app, html) => {
    window.removeEventListener("message", window.questLocationSet)
  })

  // campaign codex
  Hooks.on("renderApplicationV2", async (app, htmlRaw) => {
    let html = htmlRaw
    if (game.release.generation === 12 || html?.length === 1) {
      html = html[0]
    }
    if (!html.classList.contains("campaign-codex")) return
    if (!["location", "shop", "npc", "region"].includes(app.document?.flags?.["campaign-codex"]?.type)) return

    const nav = html.querySelector(".sidebar-tabs")
    if (!nav) return
    const div = document.createElement("div")
    div.innerHTML = `<i class="fas fa-map"></i><span class="tab-label">Stargazer</span>`
    div.className = "tab-item"
    div["data-tab"] = "stargazer"
    if (nav.querySelector('div[data-tab="stargazer"]')) return
    nav.appendChild(div)
    div.addEventListener("click", async () => {
      const form = html.querySelector(".sheet-form")
      if (!form) return
      const { width, height } = form.getBoundingClientRect()
      const flags = app.document.flags.map || {}
      const maps = game.settings.get("map", "maps")
      const map = maps[flags.location?.uuid]
      // console.log("map", map, "flags", flags)
      if (window.questLocationSet) {
        window.removeEventListener("message", window.questLocationSet)
      }

      const uuid = map?.systemMap ? "" : flags.location?.uuid
      const template = await renderTemplate(
        `modules/map/templates/codex.hbs`,
        {
          isGM: game.user.isGM,
          name: app.document.name,
          jid: app.document.uuid,
          aid: app.id,
          uuid: flags.location?.uuid,
          goto: flags.location?.location?.id,
          stargazerUrl: game.settings.get("map", "proxy"),
          height: height - 120 - (game.user.isGM ? 29 : 0),
          width: width - 50,
          iframe: `${game.settings.get("map", "proxy")}/${map?.map}/${uuid}`,
        },
      )
      if (!form) return
      const activeEl = form?.querySelector(".active")
      if (activeEl) activeEl.remove()
      const activeNav = html.querySelector(".sidebar-tabs .active")
      // console.log("nav", activeNav)
      if (activeNav) activeNav.classList.remove("active")
      div.classList.add("active")

      const container = document.createElement("div")
      if (form.querySelector(".stargazer")) return
      form.appendChild(container)
      container.outerHTML = template
    })
  })

  Hooks.on("renderApplication", async (app, htmlRaw) => {
    let html = htmlRaw
    if (game.release.generation === 12 || html?.length === 1) {
      html = html[0]
    }
    console.log(typeof html, html.id, html.length, )
    if (!html.classList.contains("forien-quest-preview")) return
    const content = html.querySelector(".window-content")
    if (!content || content.dataset.mapInjected) return
    content.dataset.mapInjected = "true"

    const inject = async () => {
      if (!game.user.isGM && !app.quest.location) return
      const nav = html.querySelector(".quest-tabs")
      if (nav && !nav.querySelector(".map-injected")) {
        const tab = document.createElement("a")
        tab.className = "item map-injected"
        tab.dataset.tab = "location"
        tab.textContent = "Location"
        nav.children[game.user.isGM ? 3 : 1]?.after(tab)
      }
      const body = html.querySelector(".quest-body")
      if (body && !body.querySelector(".map-injected")) {
        const location = app.quest.location || {}
        const maps = game.settings.get("map", "maps")
        const map = maps[app.quest.location?.uuid]
        const url = game.settings.get("map", "proxy")

        if (window.questLocationSet) {
          window.removeEventListener("message", window.questLocationSet)
        }

        const template = await renderTemplate(
          `modules/map/templates/quest.hbs`,
          {
            gm: game.user.isGM,
            questName: app.quest.name,
            questId: app.quest.id,
            uuid: location.uuid,
            goto: location?.location?.id,
            stargazerUrl: url,
            offsetHeight: body.offsetHeight - 19 - (game.user.isGM ? 29 : 0),
            offsetWidth: body.offsetWidth - 28,
            iframe: `${url}/${map?.map}/${location.uuid}?width=${body.offsetWidth - 28}&tutorial=0`,
          },
        )
        const container = document.createElement("div")
        body.appendChild(container)
        container.outerHTML = template
      }
    }

    let debounceTimeout
    const debouncedInject = () => {
      clearTimeout(debounceTimeout)
      debounceTimeout = setTimeout(() => requestAnimationFrame(inject), 100)
    }
    const observer = new MutationObserver(debouncedInject)
    observer.observe(content, { childList: true, subtree: true })
    inject()

    // Clean up on app close
    const originalClose = app.close
    app.close = async function (...args) {
      observer.disconnect()
      delete content.dataset.mapObserverAttached

      // cleanup calibration windows
      window.removeEventListener("message", window.calibrateListener)
      window.calibrateListener = null
      foundry.applications.instances.forEach(a => {
        if (a.uuid === app.quest.location?.uuid && a.url) a.close()
      })

      // console.log("close app")
      return originalClose.apply(this, args)
    }
  })

  let lastHover = 0, cleanupTimer
  Hooks.on("hoverNote", async (note, hovering) => {

    if (typeof note.document.flags.map === "undefined") return
    if (!note.document.flags.map?.name) return


    const arr = getLocations(note.document.flags.map?.source?.id)

    let el = document.querySelector("#map-location-tooltip");
    if (!el) {
      el = document.createElement('div');
      el.id = "map-location-tooltip";
      document.body.append(el);
    }

    const now = Date.now();

    if (hovering) {
      lastHover = now

      const html = await renderTemplate(`modules/map/templates/location.hbs`, {
        quests: arr,
        simpleQuests: arr.map(l => l.name),
        isGM: game.user.isGM,
        hasQuests: arr.length > 0,
        tooManyQuests: arr.length > 1,
        prettyLink: getPrettyTypeName(note.document.flags.map?.link),
        hasGoto: !!note.document.flags.map?.source?.id,
        ...note.document.flags.map,
      });

      el.innerHTML = html;

      const tooltipWidth = el.offsetWidth;
      el.style.left = `${note.position.scope.worldTransform.tx - (tooltipWidth / 2)}px`;
      el.style.top = `${note.position.scope.worldTransform.ty + 40}px`;
      el.style.opacity = '1';

    } else {
      lastHover = now;
      el.style.opacity = "0";
    }

    // schedule cleanup if not already running
    if (!cleanupTimer) {
      cleanupTimer = setInterval(() => {
        const diff = Date.now() - lastHover;
        if (diff > 20_000) el.style.opacity = "0"
      }, 1_000);
    }
  })

  Hooks.on("renderNoteConfig", async (app, htmlRaw, data) => {
    let html = htmlRaw
    if (game.release.generation === 12 || html?.length === 1) {
      html = html[0]
    }
    if (typeof data.document.flags.map?.generated === "undefined") return
    let form
    if (game.release.generation === 12) {
      form = html.querySelector('form')
    } else {
      form = html.querySelector('.form-body')
    }
    if (!form) return
    const el = document.createElement('div')
    el.innerHTML = `<fieldset>
      <legend>Stargazer</legend>
      <p class="hint">This is a generated note. If you want to edit this. Change the value in <a style="color: #ee9b3a">Stargazer</a> and regenerate the scene.</p>
      <textarea class="source" readonly>${JSON.stringify(data.document.flags.map?.source?.properties || {}, null, 2)}</textarea>
    </fieldset>`
    form.insertBefore(el, form.firstChild)
    el.querySelector('a').addEventListener('click', () => {
      if (document.querySelector(".map-manager")) return
      new MapManager().render(true)
    });
  })

  Hooks.on("renderSceneControls", async (app, htmlRaw, data) => {
    let html = htmlRaw
    if (game.release.generation === 12 || html?.length === 1) {
      html = html[0]
    }

    // Prevent duplicate injection
    if (html.querySelector('[data-control="map"]')) return

    const li = document.createElement("li")

    if (game.release.generation < 13) {
      li.className = "scene-control"
      li.dataset.control = "map"
      li.setAttribute("role", "tab")
      li.setAttribute("aria-label", "Map Controls")
      li.dataset.tooltip = "Map"

      li.innerHTML = `<i class="fa-solid fa-map"></i>`

      const controls = html.querySelector(".main-controls")
      if (!controls) return

      controls.appendChild(li)

      li.addEventListener("click", () => {
        mapKey(true)
      })

    } else {
      const button = document.createElement("button")
      button.className = "control ui-control layer icon fa-solid fa-map"
      button.dataset.tooltip = "Map"
      const exists = document.querySelector('button[data-tooltip="Map"]')
      if (exists) return
      li.appendChild(button)
      html.querySelector('menu[id="scene-controls-layers"]').appendChild(li)
      button.addEventListener("click", async () => {
        mapKey(true)
      })
    }
  })

  if (game.modules.get("forien-quest-log")?.active) {
    import("/modules/forien-quest-log/src/control/index.js").then(mod => {
      window.qdb = mod.QuestDB
    })
  }
})
