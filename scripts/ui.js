/* @license 2026 CodaBool all rights reserved */

import {
  pickUsers,
  rgbToHex,
  DEFAULTS,
  delay,
  estimateFileSize,
  hashStringToColor,
  injectedFunc,
  SALT,
  useDeprecatedClickListener,
  ensureSystemMap,
} from "./util.js"
const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api
let controller

export class IFrame extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["map-iframe"],
    window: {
      resizable: true,
      frame: true,
    },
    position: { width: 900, height: 900 },
  }
  static PARTS = {
    form: { template: "modules/map/templates/iframe.hbs" },
  }
  constructor(uuid, url, title, query) {
    super()
    this.uuid = uuid
    this.url = url
    this.header = title
    this.query = query
    this.listener = null

  }
  close() {
    window.removeEventListener("message", this.listener)
    return super.close()
  }

  _onRender(context) {
    const size = Math.min(window.innerWidth, window.innerHeight) * 0.9
    foundry.applications.instances.forEach(a => {
      if (a.url === this.url) a.setPosition({ height: size, width: size })
    })

    // listener
    this.listener = e => {
      if (e.origin !== game.settings.get("map", "proxy")) return
      if (e.data.type === "link" && e.data.link) {
        if (e.data.notify) {
          ui.notifications.info(e.data.notify)
        }
        injectedFunc({ target: { parent: { document: { flags: { map: {link: e.data.link, noDialog: true} } } } } })
      } else if (e.data.type === "log") {
        console.log(e.data.message)
      }
    }
    window.addEventListener("message", this.listener)

    // fix header
    const el = document.querySelector(".map-iframe section")
    el.style.padding = 0
    el.style.overflow = "hidden"
    foundry.applications.instances.forEach(a => {
      if (a.uuid === this.uuid && this.header) {
        a.element.querySelector(".window-title").innerHTML = this.header
      }
    })
  }

  _prepareContext() {
    if (this.url) return { url: this.url }
    const maps = game.settings.get("map", "maps")
    const url = game.settings.get("map", "proxy")
    const map = maps[this.uuid]

    if (map.url) return { url: map.url }
    console.log(
      "opening stargazer iframe",
      `${url}/${maps[this.uuid].map}/${this.uuid}?iframe=1`,
    )
    return {
      url: `${url}/${map.map}/${this.uuid}?iframe=1&tutorial=0${this.query ?? ""}`,
    }
  }
}

export class Screenshot extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["map-iframe"],
    position: { height: 220 },
  }
  static PARTS = {
    form: { template: "modules/map/templates/screenshot.hbs" },
  }
  constructor(uuid) {
    super()
    this.uuid = uuid
    this.featureData = null
    this.onMessage = null
  }

  close() {
    window.removeEventListener("message", this.onMessage)
    return super.close()
  }

  async _onRender(ctx) {
    function setError(msg) {
      const text = document.querySelector("#map-generate-text h1")
      const spinner = document.querySelector("#map-generate-text .spinner")
      text.innerHTML = `<i class="fa-solid fa-bug fa-bounce"></i> ${msg || "Error"}`
      text.style.fontSize = "1.7em"
      spinner.style.display = "none"
    }
    const url = game.settings.get("map", "proxy")
    fetch(url, { method: "HEAD", mode: "no-cors" }).catch(() => {
      setError("CODE 500: stargazer not reachable")
    })
    let jid = game.journal._source.filter(f => f.name === "use this for stargazer map linking")
    if (jid.length === 1) jid = jid[0]._id
    const el = document.querySelector(".map-iframe section")
    el.style.padding = 0
    el.style.overflow = "hidden"

    this.onMessage = async event => {
      if (event.origin !== url) {
        return
      }
      if (event.data.type === "webpImage") {
        while (!this.featureData) {
          // console.log("waiting on userData")
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        const webpImage = event.data.webpImage

        // Convert the base64 data URL into a Blob
        const byteCharacters = atob(webpImage.split(",")[1]) // Decode base64
        const byteArrays = []
        for (let offset = 0; offset < byteCharacters.length; offset++) {
          const byte = byteCharacters.charCodeAt(offset)
          byteArrays.push(byte)
        }
        const byteArray = new Uint8Array(byteArrays)
        const blob = new Blob([byteArray], { type: "image/webp" })
        const filename = `${ctx.map.map}_z${Math.floor(ctx.map.autoZoom)}_lng${Math.floor(ctx.map.autoLng)}_lat${Math.floor(ctx.map.autoLat)}_${ctx.map.autoWidth}x${ctx.map.autoHeight}.webp`
        const file = new File([blob], filename, { type: "image/webp" })

        const existingFiles = await FilePicker.browse(
          "data",
          "modules/map/storage",
        )
        const fileExists = existingFiles.files.some(f => f.includes(filename))
        if (fileExists) {
          ui.notifications.info(
            `overwriting background. Refresh the page to see the new background.`,
          )
        }
        const result = await FilePicker.upload(
          "data",
          "modules/map/storage",
          file,
          {},
          { notify: false },
        )
        if (result.status === "success") {
          // get from settings folder
          const folderName = game.settings.get("map", "folder")
          let folder = game.folders.getName(folderName)
          if (!folder) {
            folder = await Folder.create({ name: folderName, type: "Scene" })
          }
          const name = ctx.map.name
          let scene = game.scenes.find(s => s.name === name)

          const reasonableSize = Math.floor(ctx.map.autoHeight / 30)
          if (!scene) {
            // probably want to have 30 token moves to get from bottom to top
            const { background } = DEFAULTS(game.system.id)

            const data = {
              name,
              width: ctx.map.autoWidth,
              height: ctx.map.autoHeight,
              padding: 0,
              folder: folder.id,
              fogExploration: false,
              tokenVision: false,
            }

            if (game.release.generation >= 14) {
              data.levels = [{
                name: "Base",
                background: {
                  src: `modules/map/storage/${filename}`,
                  color: Color.from(background),
                },
              }]
              data.grid = {
                type: CONST.GRID_TYPES.GRIDLESS,
                size: reasonableSize,
                units: event.data.unit,
                distance: event.data.distance / reasonableSize,
              }
            } else {
              data.background = { src: `modules/map/storage/${filename}` }
              data.backgroundColor = Color.from(background)
              data.grid = new foundry.grid.GridlessGrid({
                size: reasonableSize,
                units: event.data.unit,
                distance: event.data.distance / reasonableSize,
              })
            }

            scene = await Scene.create(data);

          } else {
            await scene.update({
              width: ctx.map.autoWidth,
              height: ctx.map.autoHeight,
              background: { src: `modules/map/storage/${filename}` },
              grid: {
                size: reasonableSize,
                units: event.data.unit,
                distance: event.data.distance / reasonableSize,
              },
            })

            if (game.release.generation >= 14) {
              const level = Array.from(scene.levels.entries())[0][1]
              level.update({
                background: { src: `modules/map/storage/${filename}` },
              })
            }
          }

          let s = 1
          let attempts = 0
          const maxAttempts = 10

          while (!s.drawings && attempts < maxAttempts) {
            s = await scene.view()
            if (!s.drawings) {
              await delay(500)
              attempts++
            }
          }

          if (!s || typeof s === "number") {
            setError("CODE 400: failed to change scene")
            return
          }

          const notes = s.notes?.filter(n => n.flags.map?.generated).map(n => n.id) || []
          if (notes.length > 0) {
            await s.deleteEmbeddedDocuments("Note", notes)
          }

          // there is a race condition here. This sometimes fails when 40+ notes
          const drawing = s.drawings.find(d => d.flags?.map?.generated)
          if (drawing) {
            // console.log("found previous text", drawing)
            await s.deleteEmbeddedDocuments("Drawing", [drawing.id])
          }

          await s.createEmbeddedDocuments("Drawing", [
            {
              text: "This is an autogenerated scene, background image & generated map notes will be overwritten on subsequent generations",
              fontSize: 18,
              fontFamily: "Bruno Ace", // optional: choose a nice font
              strokeWidth: 0,
              textColor: "#ffffff",
              fillColor: "#000000",
              hidden: true,
              shape: { width: 400, height: 100 }, // THIS is how to set size properly
              x: canvas.scene.dimensions.width / 2 - 200,
              y: 50,
              flags: { map: { generated: true } },
            },
          ])

          const arr = []
          for (const f of this.featureData) {
            const {
              name,
              type,
              link,
              fill,
              image,
              caption,
              starType,
              userCreated,
              icon,
              description,
            } = f.properties

            let tint = fill ?? ""
            if (tint?.includes("#")) {
              tint = Color.from(fill)
            } else if (tint) {
              const rgb = fill?.match(/\d+/g)?.map(Number)
              tint = Color.from(rgbToHex(rgb[0], rgb[1], rgb[2]))
            }

            arr.push({
              iconSize: 40,
              entryId: typeof jid === "string" ? jid : "", // required for inject func
              texture: {
                src: icon || "",
                tint,
              },
              text: name || "",
              x: f.pixelCoordinates.left,
              y: f.pixelCoordinates.top,
              flags: {
                map: {
                  generated: true,
                  uuid: this.uuid,
                  mapName: ctx.map.map,
                  source: {properties: f.properties, geometry: f.geometry, id: f.id},
                  description,
                  userCreated,
                  type,
                  link,
                  name,
                  image,
                  caption,
                  starType,
                },
              },
            })
          }
          s.createEmbeddedDocuments("Note", arr)
          this.close()
        } else {
          setError()
        }
      } else if (event.data.type === "log") {
        console.log(event.data.message)
      } else if (event.data.type === "featureData") {
        // TODO: this action can be slow, and is a race condition
        this.featureData = event.data.featureData
      }
    }
    window.addEventListener("message", this.onMessage)
  }

  _prepareContext() {
    const maps = game.settings.get("map", "maps")
    const map = maps[this.uuid] || {}
    const defaults = DEFAULTS(map?.map)
    for (const key of [
      "autoWidth",
      "autoHeight",
      "autoZoom",
      "autoLng",
      "autoLat",
    ]) {
      if (typeof map[key] === "undefined") {
        map[key] = defaults[key]
      }
    }
    game.settings.set("map", "maps", maps)

    const url = game.settings.get("map", "proxy")
    console.log(
      "go to",
      `${url}/${map.map}/${this.uuid}?z=${map.autoZoom}&locked=1&img=1&width=${map.autoWidth}&height=${map.autoHeight}&lng=${map.autoLng}&lat=${map.autoLat}&search=0&zoom=0&hamburger=0`,
    )
    // "img" starts the postMessage handshake
    return {
      url: `${url}/${map.map}/${this.uuid}?z=${map.autoZoom}&locked=1&img=1&width=${map.autoWidth}&height=${map.autoHeight}&lng=${map.autoLng}&lat=${map.autoLat}&search=0&zoom=0&hamburger=0`,
      uuid: this.uuid,
      map: maps[this.uuid],
    }
  }
}

export class SceneSelect extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["map-scene-selector"],
    window: {
      title: "Select Map To View",
      icon: "fa-solid fa-map",
    },
    position: { width: 450 },
  }
  static PARTS = {
    form: { template: "modules/map/templates/select.hbs" },
  }
  constructor(objs, sceneTitle) {
    super()
    this.objs = objs
    this.sceneTitle = sceneTitle
  }
  _prepareContext() {
    return {
      objs: this.objs,
      title: this.sceneTitle,
      isScene: this.sceneTitle === "Which Map do you want to see",
    }
  }
}

export class Feedback extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    window: {
      title: "Feedback",
      icon: "fa-solid fa-bug",
    },
    form: {
      handler: this.submit,
      closeOnSubmit: true,
    },
  }
  static PARTS = {
    form: { template: "modules/map/templates/feedback.hbs" },
  }
  static async submit(e, form, data) {
    if (!data.object.feedback) return
    const version = game.data.release.generation + "." + game.data.release.build
    const active = game.modules
      .filter(m => m.active)
      .map(m => m.id)
      .join(";")
    fetch(
      "https://d3erver.codabool.workers.dev/email" +
        encodeURI(
          `?version=${version}&module=map-${game.modules.get("map").version}&active=${active}&system=${game.system.id}`,
        ),
      {
        method: "post",
        body: data.object.feedback,
      },
    )
    ui.notifications.info(`🙇 Feedback recieved`)
  }
}

export class MapManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["map-window", "map-compact", "map-scroll", "map-manager"],
    tag: "form",
    window: {
      title: "Map Manager",
      icon: "fa-solid fa-map",
    },
    form: {
      handler: this.submit,
      submitOnChange: true,
    },
    actions: {
      edit: this.edit,
      delete: this.delete,
      create: this.create,
      open: this.open,
      editRemoteMap: this.editRemoteMap,
      syncMaps: this.syncMaps,
      generateScene: this.generateScene,
      openForUsers: this.openForUsers,
      openForAll: this.openForAll,
      changeDefault: this.changeDefault,
      // premium: this.premium,
      feedback: this.feedback,
      openSettings: this.openSettings,
    },
    position: { width: 600 },
  }

  static PARTS = {
    form: { template: "modules/map/templates/mapManager.hbs" },
  }

  constructor() {
    super()
    this.listener = null
  }

  _onRender(context, arg2) {
    if (game.tours.get("map.map-manager")?.status === "unstarted") {
      game.tours.get("map.map-manager").start()
    }

    // allow for Enter to submit
    const div = document.querySelector('#map-url')
    if (!div) return
    div.addEventListener('keydown', async (ev) => {
      ev.stopPropagation()
      if (ev.key === 'Enter') {
        ev.preventDefault()
        ev.stopImmediatePropagation()
        const value = div.textContent.trim()
        if (!value) return
        MapManager.create.call(this)
      }
    })
  }

  close() {
    controller?.abort()
    if (game.settings.get("map", "pointer")) {
      foundry.applications.instances.forEach(app => {
        if (app.id === game.settings.get("map", "pointer")) app.close()
      })
      game.settings.set("map", "pointer", "")
      ui.notifications.info("click listener canceled")
      foundry.applications.instances.forEach(a => a.maximize())
      Object.values(ui.windows).forEach(a => a.maximize())
    }
    window.removeEventListener("message", this.listener)
    // close map module windows
    foundry.applications.instances.forEach(a => {
      if (a instanceof GenerateMap || a.classList.contains("remote-map-edit")) {
        a.close()
      }
    })
    return super.close()
  }
  static async editRemoteMap(e) {
    if (document.querySelector(".remote-map-edit")) {
      ui.notifications.error("Only one remote map can be edited at a time")
      return
    }
    const maps = game.settings.get("map", "maps")
    const secret = game.settings.get("map", "secret")

    if (!secret) {
      ui.notifications.error("A Stargazer secret must be set in settings")
      return
    }

    const url = game.settings.get("map", "proxy")
    const uuid = e.target.attributes.uuid.value
    const map = maps[uuid]
    const iframe = await new IFrame(
      uuid,
      `${url}/${map.map}?secret=${game.settings.get("map", "secret")}&uuid=${uuid}&map=${map.map}&id=foundry&hamburger=0&search=0&waitForFetch=1&disallowPreview=1`,
      "Editing " + map.name,
    ).render(true)
    iframe.element.classList.add("remote-map-edit")
    // console.log("iframe", iframe)
    window.removeEventListener("message", this.listener)
    this.listener = async event => {
      if (event.origin !== url) return
      const { tab, doc, type, message } = event.data
      if (type === "link") {
        if (message === "success") {
          ui.notifications.info("Remote map for " + map.map + " updated")
          foundry.applications.instances.get(iframe.id).close()
        }
      } else if (type === "listen") {
        Object.values(ui.windows).forEach(a => {
          if (a.id !== "forien-quest-log") a.minimize()
        })
        foundry.applications.instances.forEach(a => a.minimize())
        ui.notifications.info(
          `🖱️ Click on a ${doc} to link. Close 'Map Manager' window to cancel`,
        )
        game.settings.set("map", "pointer", iframe.id)



        if (tab && game.release.generation > 12) {
          ui.sidebar.expand()
          ui.sidebar.changeTab(tab, "primary")
        } else if (doc === "quest") {
          Hooks.call("ForienQuestLog.Open.QuestLog")
        }

        controller = new AbortController()
        const { signal } = controller

        if (game.release.generation === 12) {
          useDeprecatedClickListener({ tab, doc, type, message, signal, iframe, controller })
          return
        }

        window.addEventListener(
          "click",
          async e => {
            let id
            if (doc === "journal page") {
              if (e.target.parentElement.parentElement.nodeName === "LI") {
                const pid =
                  e.target.parentElement.parentElement.getAttribute(
                    "data-page-id",
                  )
                if (pid) {
                  const jid =
                    e.target.parentNode?.parentNode?.parentNode?.parentNode
                      ?.parentNode?.parentNode?.parentNode?.id || ""
                  const journalEntry = game.journal
                    .get(jid?.split("-")[2])
                    .pages.get(pid)
                  if (journalEntry) {
                    id = journalEntry.uuid
                    foundry.applications.instances.forEach(app => {
                      if (app.id === jid) app.close()
                    })
                  }
                }
              }
            } else if (doc === "quest") {
              if (e.target.nodeName === "H2" || e.target.nodeName === "DIV") {
                id = e.target.parentNode.getAttribute("data-quest-id")
              } else if (e.target.nodeName === "LI") {
                id = e.target.getAttribute("data-quest-id")
              }
              if (id) {
                id = "forien-quest-log." + id
                Object.values(ui.windows).forEach(a => {
                  if (a.id === "forien-quest-log") a.close()
                })
                // TODO: when coding opening you can use their api
                // const { QuestAPI } = await import("/modules/forien-quest-log/src/control/public/QuestAPI.js")
                // QuestAPI.open({questId: id.split(".")[1]})
              }
            } else {
              // macros or journal or scenes
              if (e.target.parentNode.nodeName === "LI") {
                id = e.target.parentNode?.getAttribute("data-entry-id")
              }

              if (id) {
                if (doc === "macro") {
                  id = game.macros.get(id)?.uuid || null
                } else if (doc === "journal") {
                  id = game.journal.get(id)?.uuid || null
                } else if (doc === "scene") {
                  id = game.scenes.get(id)?.uuid || null
                }
              }
            }
            if (id) {
              e.stopPropagation()
              Object.values(ui.windows).forEach(app => app.maximize())
              foundry.applications.instances.forEach(a => a.maximize())
              // console.log("found uuid", id)
              const frame = iframe.element?.querySelector("iframe")
              if (frame) {
                frame.contentWindow.postMessage({ type: "uuid", uuid: id }, "*")
              }
              controller.abort()
            }
          },
          { signal, capture: true },
        )
      } else if (type === "log") {
        console.log(message)
      } else if (type === "modules") {
        const frame = iframe.element.querySelector("iframe")
        if (frame) {
          frame.contentWindow.postMessage(
            {
              type: "modules",
              modules: game.modules.filter(m => m.active).map(m => m.id),
            },
            "*",
          )
        }
      }
    }
    window.addEventListener("message", this.listener)
  }
  static async feedback() {
    new Feedback().render(true)
  }

  static async delete(e) {
    const uuid = e.target.attributes.uuid.value
    const maps = game.settings.get("map", "maps")
    const content = `<p style="margin-top: 1em; font-size:1.3em">Are you sure you want to delete <strong>${maps[uuid].name} | ${maps[uuid].map}</strong>?</p>${maps[uuid].url ? "" : '<hr/><p style="opacity:.8;font-size:1.3em; text-align:center">The map will still exist remotely in Stargazer</p>'}`
    const replace = await foundry.applications.api.DialogV2.confirm({
      modal: true,
      rejectClose: false,
      window: { title: `Delete ${maps[uuid].name}?` },
      position: { width: 400 },
      content,
    })
    if (!replace) return
    delete maps[uuid]

    // pick another default if the current one is being deleted
    if (maps.meta.default === uuid) {
      const otherUuids = Object.keys(maps).filter(
        key => key !== "meta" && key !== uuid,
      )
      if (otherUuids.length > 0) {
        maps.meta.default = otherUuids[0]
      } else {
        maps.meta.default = null
      }
    }
    await game.settings.set("map", "maps", maps)
    this.render()
  }
  static generateScene(e) {
    const maps = game.settings.get("map", "maps")
    const map = maps[e.target.attributes.uuid.value]
    new GenerateMap(e.target.attributes.uuid.value, map?.name).render(true)
  }
  static async openForUsers(e) {
    const maps = game.settings.get("map", "maps")
    if (!maps.meta.default) {
      ui.notifications.error("No default map")
      return
    }
    const [uids, uuid] = await pickUsers()
    if (uids?.length === 0 || !uids) return
    const mapName = maps[uuid].name
    ui.notifications.info(`opened ${mapName} for ${uids.map(u => game.users.get(u).name)}`)
    // console.log(uids)
    game.socket.emit("module.map", { action: "openIframe", uids, uuid })
  }
  static openForAll(e) {
    const maps = game.settings.get("map", "maps")
    const uuid = maps.meta.default
    if (!uuid) {
      ui.notifications.error("No default map")
      return
    }
    const uids = game.users
      .filter(user => !user.isSelf && user.active)
      .map(u => u.id)
    if (uids.length < 1) {
      ui.notifications.error(`no users online`)
      return
    }
    const mapName = maps[uuid].name
    ui.notifications.info(`opened ${mapName} for ${uids.length} users`)
    game.socket.emit("module.map", { action: "openIframe", uids, uuid })
  }

  static async syncMaps() {
    const secret = game.settings.get("map", "secret")
    const maps = game.settings.get("map", "maps")

    if (!secret) {
      ui.notifications.error("A Stargazer secret must be set in settings")
      return
    }

    const response = await fetch(
      `${game.settings.get("map", "proxy")}/api/v1/map/sync`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ secret, maps }),
      },
    )

    if (!response.ok || response.status >= 500) {
      ui.notifications.error("Stargazer server is having issues")
      return
    }

    const data = await response.json()
    if (data.error) {
      ui.notifications.error(data.error)
    } else if (data.msg === "success") {
      // console.log("MAP SYNC: remote", data.maps, "local", maps)
      if (data.hashChanged.length > 0) {
        ui.notifications.info(
          `new features detected for map${data.hashChanged.length === 1 ? "" : "s"} ${data.hashChanged.toString()}. Click generate to recreate their scene.`,
        )
      }
      if (data.hashChanged.length === 0 && data.added === 0) {
        ui.notifications.info("in sync")
      } else {
        ui.notifications.info(
          `${data.length} Maps synced. ${data.added > 0 ? `${data.added} added` : ""}`,
        )
      }
      // set a default if it is missing
      const obj = { ...data.maps, meta: data.meta || {} }
      if (!data.meta?.default) {
        if (data.length > 0) {
          obj.meta.default = Object.keys(data.maps)[0]
        }
      }
      await game.settings.set("map", "maps", obj)
      this.render()
    }
  }

  static open(e) {
    const isOpen = Array.from(foundry.applications.instances.values()).some(
      a => a instanceof IFrame && a.uuid === e.target.attributes.uuid.value,
    )
    if (isOpen) {
      ui.notifications.error("Map already open")
      return
    }
    const maps = game.settings.get("map", "maps");
    const map = maps[e.target.attributes.uuid.value]


    new IFrame(e.target.attributes.uuid.value, null, map.name || "", "&tutorial=0").render(true)
    // console.log("maps", maps, "map", map)
  }
  static openSettings(e) {
    new foundry.applications.settings.SettingsConfig().render(true)
  }

  static changeDefault(e) {
    const maps = game.settings.get("map", "maps")
    maps.meta.default = e.target.attributes.uuid.value
    game.settings.set("map", "maps", maps)
  }

  static async create() {
    const maps = game.settings.get("map", "maps")
    const mapURL = document.getElementById("map-url").innerHTML
    const id = `custom-${Date.now()}`
    let domain
    try {
      domain = new URL(mapURL).hostname
    } catch {
      ui.notifications.error("Invalid URL")
      return
    }

    maps[id] = {
      url: mapURL,
      name: domain || id,
      map: "url",
      uuid: id,
    }
    if (Object.keys(maps).length === 2) {
      maps.meta.default = id
    }
    await game.settings.set("map", "maps", maps)
    this.render()
  }

  static async submit(e, form, { object }) {
    const maps = game.settings.get("map", "maps")
    for (const [key, value] of Object.entries(object)) {
      const [uuid, property] = key.split(".")
      if (maps[uuid]) {
        maps[uuid][property] = value
      }
    }
    await game.settings.set("map", "maps", maps)
    this.render()
  }

  async _prepareContext() {
    const maps = game.settings.get("map", "maps")
    const mapsCopy = foundry.utils.deepClone(maps)
    const withEnsuredSystemMap = await ensureSystemMap(mapsCopy)
    const meta = withEnsuredSystemMap.meta
    delete withEnsuredSystemMap["meta"]
    const { version } = game.modules.get("map")
    const arr = Object.values(withEnsuredSystemMap)
      .map(m => ({ ...m, color: hashStringToColor(m.map || "") }))
      .sort((a, b) => (a.map || "").localeCompare(b.map || ""))

    return {
      maps: arr,
      numOfMaps: arr.length,
      moduleVersion: [version, version.replace(/\./g, "")],
      hasMaps: arr.length !== 0,
      secret: game.settings.get("map", "secret")?.length === 36,
      stargazerBaseURL: game.settings.get("map", "proxy"),
      ...meta,
    }
  }
}

export class GenerateMap extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["map-compact"],
    tag: "form",
    window: {
      title: "Generate Scene",
      icon: "fa-solid fa-wand-magic-sparkles",
    },
    form: {
      handler: this.submit,
      submitOnChange: true,
    },
    actions: {
      calibrate: this.calibrate,
      generate: this.generate,
      getPersistSize: this.getPersistSize,
    },
    position: { width: 600 },
  }
  static PARTS = {
    form: { template: "modules/map/templates/generateScene.hbs" },
  }
  constructor(uuid, map) {
    super()
    this.uuid = uuid
    this.map = map
    this.calibrateListener = null
  }
  static submit(e, form, { object }) {
    const maps = game.settings.get("map", "maps")
    for (const key in object) {
      if (object[key] === null) delete object[key]
    }
    if (object.autoHeight < 500) {
      ui.notifications.error("Height must be greater than 500 pixels")
      return
    }
    if (object.autoWidth < 500) {
      ui.notifications.error("Width must be greater than 500 pixels")
      return
    }
    maps[this.uuid] = { ...maps[this.uuid], ...object }
    // console.log("saving", maps[this.uuid])
    game.settings.set("map", "maps", maps)
  }
  static generate() {
    new Screenshot(this.uuid).render(true)
  }

  _onRender(context) {
    if (game.tours.get("map.generate-scene")?.status === "unstarted") {
      game.tours.get("map.generate-scene").start()
    }
    foundry.applications.instances.forEach(a => {
      if (a.uuid === this.uuid) {
        a.element.querySelector(".window-title").innerHTML =
          "Generate Scene for " + this.map
      }
    })
  }

  close() {
    window.removeEventListener("message", this.calibrateListener)
    return super.close()
  }

  static async calibrate() {
    const maps = game.settings.get("map", "maps")
    const map = maps[this.uuid]
    console.log("get the map from uuid", this.uuid, "larger map obj", maps)
    new IFrame(
      this.uuid,
      `${game.settings.get("map", "proxy")}/${map.map}/${this.uuid}?z=${map.autoZoom}&lng=${map.autoLng}&lat=${map.autoLat}&c=1&calibrate=1&search=0&hamburger=0&zoom=0&tutorial=0`,
    ).render(true)
    this.calibrateListener = async event => {
      if (event.origin !== game.settings.get("map", "proxy")) return
      if (event.data.type === "calibrate") {
        delete event.data.type
        Object.assign(map, event.data)
        maps[this.uuid] = map
        await game.settings.set("map", "maps", maps)
        foundry.applications.instances.forEach(a => {
          if (a.uuid === this.uuid && a.url) a.close()
        })
        this.render()
      }
    }
    window.addEventListener("message", this.calibrateListener)
  }

  static async getPersistSize() {
    let fileCount = 0,
      size = 0
    await FilePicker.browse("data", "modules/map/storage").then(
      async ({ files }) => {
        fileCount = files.length
        for (const file of files) {
          const response = await fetch(file, { method: "HEAD" })
          size += Number(response.headers.get("Content-Length"))
        }
      },
    )
    foundry.applications.api.DialogV2.wait({
      window: { title: `Size of /modules/map/storage` },
      position: { width: 300 },
      content: `<p>Total Size = ${(size / 1024 ** 3).toFixed(4)}Gb</p><p>Files = ${fileCount}</p>`,
      buttons: [
        {
          action: "1",
          label: " ",
          icon: "fas fa-check",
        },
      ],
    })
  }

  async _prepareContext() {
    const maps = game.settings.get("map", "maps")
    const defaults = DEFAULTS(maps[this.uuid]?.map)
    for (const key of [
      "autoWidth",
      "autoHeight",
      "autoZoom",
      "autoLng",
      "autoLat",
    ]) {
      if (typeof maps[this.uuid][key] === "undefined") {
        maps[this.uuid][key] = defaults[key]
      }
    }

    const estimatedSize = await estimateFileSize("modules/map/storage")
    return {
      ...maps[this.uuid],
      estimatedSize,
    }
  }
}
