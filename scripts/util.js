/* @license 2026 CodaBool all rights reserved */

import { IFrame, MapManager } from "./ui.js"

// export const STARGAZER_URL = "http://192.168.0.16:3000"
export const STARGAZER_URL = "https://stargazer.vercel.app"

export function getLocations(id) {
  const arr = []
  if (!id) return arr

  // TODO: test when window.qdb.getAllQuests() should be undefined. meaning fresh Foundry install
  if (game.modules.get("campaign-codex")?.active) {
    // console.log("codex", game.journal)
    (game.journal?.contents || [])
      .filter(
        j =>
          j?.flags?.map?.location?.location?.id === id &&
          j?.flags?.["campaign-codex"]?.data?.linkedQuests?.length > 0,
      )
      .forEach(j => {
        for (const quest of j.flags["campaign-codex"].data.linkedQuests) {
          const entry = fromUuidSync(quest)
          if (!entry.flags["campaign-codex"]?.data?.quests?.length) continue
          entry.flags["campaign-codex"].data.quests.forEach(q => {
            if (!q.completed)
              arr.push({
                location: j.flags.map.location,
                name: j.name,
                source: "codex",
                type: j.flags["campaign-codex"].type,
                image: j.flags["campaign-codex"].image,
                ...q,
              })
          })
        }
      })
  }

  if (game.modules.get("forien-quest-log")?.active) {
    if (typeof window.qdb === "function") {
      // console.log("raw fql", window.qdb.getAllQuests().filter(q => q.location?.location?.id === id))
      arr.push(
        ...window.qdb
          .getAllQuests()
          .filter(
            q =>
              q.location?.location?.id === id &&
              (q.status === "active" || q.status === "available"),
          )
          .map(q => ({
            ...q,
            image: q.image === "actor" ? null : q.image,
            source: "fql",
            name: q.name,
            title: q.name,
            description: q.description,
            completed: q.status === "completed",
            visible: !q.isHidden,
            objectives: q.tasks.map(t => ({
              ...t,
              text: t.name,
              visible: !t.hidden,
            })),
          })),
      )
    }
  }
  return arr
}

export function injectedFunc(e, eventName) {
  if (!e.target.parent.document.flags.map) return
  const flags = e.target.parent.document.flags.map
  const doc = fromUuidSync(flags.link)
  const quests = getLocations(flags.source?.id)

  if (!quests.length && !doc && !flags.source?.id) {
    if (flags.link && !doc) {
      ui.notifications.error("Could not find doc for uuid " + flags.link)
    }
    return false
  }

  const buttons = []
  quests.forEach((quest, index) => {
    buttons.push({
      action: `open quest ${index + 1}`,
      label: `${quest.title}`,
      icon: "fas fa-scroll",
      callback: async (event, button, dialog) => {
        if (quest.source === "fql" && quest.location?.questId && game.modules.get("forien-quest-log")?.active) {
          const qdb =
            await import("/modules/forien-quest-log/src/control/index.js")
          const q = qdb.QuestDB.getQuest(quest.location.questId)
          if (q) q.sheet.render(true)
        } else if (quest.source === "codex" && quest.location?.questId && game.modules.get("campaign-codex")?.active) {
          const journal = fromUuidSync(quest.location?.questId)
          journal.sheet.render(true)
          setTimeout(() => {
            document.querySelector('div[data-tab="quests"]')?.click()
          }, 300)
        }
      },
    })
  })
  if (doc) {
    buttons.push({
      action: "open link",
      label: "Link",
      icon: "fas fa-link",
      callback: (event, button, dialog) => {
        const doc = fromUuidSync(window.mapStoringTempOptions.flags.link)
        useFoundryLink(doc)
      },
    })
  }
  if (flags.source?.id) {
    buttons.push({
      action: "open map",
      label: "Map",
      icon: "fas fa-map",
      callback: (event, button, dialog) => {
        const { uuid, mapName, source } = window.mapStoringTempOptions.flags
        new IFrame(
          uuid,
          `${game.settings.get("map", "proxy")}/${mapName}/${uuid}?tutorial=0&goto=${source?.id}&search=0&cheeseburger=1&iframe=1`,
          flags.name,
        ).render(true)
      },
    })
  }

  if (flags.noDialog) {
    useFoundryLink(doc)
    return true
  }

  if (quests.length === 0 && !doc && flags.source?.id) {
    new IFrame(
      flags.uuid,
      `${game.settings.get("map", "proxy")}/${flags.mapName}/${flags.uuid}?tutorial=0&goto=${flags.source?.id}&search=0&cheeseburger=1&iframe=1`,
      flags.mapName,
    ).render(true)
    return true
  }
  window.mapStoringTempOptions = { flags, quests }
  foundry.applications.api.DialogV2.wait({
    window: { title: flags.name + " actions" },
    classes: ["map-dialog-note-click"],
    content: `<p>${flags.name} has multiple associations. Select one.</p>`,
    buttons,
  })
  return true
}

function useFoundryLink(doc) {
  if (doc instanceof JournalEntry) {
    doc.sheet.render(true)
  } else if (doc instanceof JournalEntryPage) {
    doc.parent.sheet.render(true, { pageId: doc.id })
  } else if (doc instanceof Macro) {
    doc.execute()
  } else if (doc instanceof Scene) {
    doc.view()
  } else {
    const link = e.target.parent.document.flags.map.link || ""
    const arr = link.split(".")
    if (!game.modules.get("forien-quest-log")?.active) {
      ui.notifications.error("forien quest log is not active " + link)
      return false
    } else if (arr.length === 2 && link.includes("forien-quest-log.")) {
      import("/modules/forien-quest-log/src/control/index.js").then(
        ({ QuestDB }) => {
          const quest = QuestDB.getQuest(arr[1])
          if (quest) quest.sheet.render(true)
        },
      )
    } else {
      // console.log("props", e.target.parent.document.flags.map)
      ui.notifications.error("Bad link " + link)
      return false
    }
  }
}

export function getPrettyTypeName(link) {
  if (!link) return null
  const doc = fromUuidSync(link)
  if (doc instanceof JournalEntry) {
    return "Journal"
  } else if (doc instanceof JournalEntryPage) {
    return "Journal Page"
  } else if (doc instanceof Macro) {
    return "Macro"
  } else if (doc instanceof Scene) {
    return "Scene"
  } else {
    return "Quest"
  }
}

export function moveAnchorTop(sid) {
  game.scenes.get(sid).notes.forEach(note => {
    note.update({ textAnchor: 2 })
  })
}

export function mapKey(e) {
  // opened using controls button
  if (game.user.isGM && e) {
    if (document.querySelector(".map-manager")) return
    new MapManager().render(true)
  } else {
    // either hotkey or user controls button
    const maps = game.settings.get("map", "maps")
    const isOpen = Array.from(foundry.applications.instances.values()).some(
      a => a instanceof IFrame && a.uuid === maps.meta.default,
    )
    if (isOpen) return
    // console.log("maps default", maps)
    if (maps.meta.default) {
      new IFrame(
        maps.meta.default,
        null,
        maps[maps.meta.default]?.name,
        "&tutorial=0",
      ).render(true)
    } else if (Object.values(maps).length === 2) {
      const mapsCopy = foundry.utils.deepClone(maps)
      delete mapsCopy["meta"]
      const { uuid, name } = Object.values(mapsCopy)[0]
      new IFrame(uuid, null, name, "&tutorial=0").render(true)
    } else if (game.user.isGM) {
      if (document.querySelector(".map-manager")) return
      new MapManager().render(true)
      // ui.notifications.error("No maps")
    }
  }
}

export async function estimateFileSize(path) {
  const calculateExpectedSize = (width, height) => {
    const sampleWidth = 5200 // was originall 1000 idk what's the best estimate
    const sampleHeight = 5200
    const sampleSizeInBytes = 185 * 1024 // 185kB to bytes
    const bytesPerPixel = sampleSizeInBytes / (sampleWidth * sampleHeight)
    return Math.round(bytesPerPixel * width * height)
  }

  const extractDimensionsFromFilename = filename => {
    const match = filename.match(/_(\d+)x(\d+)\./)
    if (match) {
      const width = parseInt(match[1], 10)
      const height = parseInt(match[2], 10)
      return { width, height }
    }
    return null
  }

  const bytesToGB = bytes => bytes / 1024 ** 3

  let size = 0
  await FilePicker.browse("data", path).then(async data => {
    for (const file of data.files) {
      const dimensions = extractDimensionsFromFilename(file)
      if (!dimensions) continue
      const { width, height } = dimensions
      const expectedSize = calculateExpectedSize(width, height)
      size += Number(expectedSize)
    }
  })

  return bytesToGB(size).toFixed(3)
}
export async function useDeprecatedClickListener({
  tab,
  doc,
  type,
  message,
  signal,
  iframe,
  controller,
}) {
  if (tab === "macros") {
    ui.macros.render(true)
  } else if (doc === "quest") {
  } else {
    ui.sidebar.expand()
    ui.sidebar.tabs[tab].activate()
  }

  function getId(e, doc) {
    let id
    if (e.target.nodeName === "A") {
      if (
        e.target.parentNode?.parentNode?.classList.contains("directory-item")
      ) {
        id = e.target.parentNode?.parentNode?.getAttribute("data-document-id")
      }
    } else if (e.target.nodeName === "H4" || e.target.nodeName === "IMG") {
      if (
        e.target.classList.contains("thumbnail") ||
        e.target.classList.contains("entry-name") ||
        e.target.classList.contains("document-name")
      ) {
        if (e.target.parentNode?.classList.contains("directory-item")) {
          id = e.target.parentNode?.getAttribute("data-document-id")
        }
      }
    } else if (
      e.target.nodeName === "H3" &&
      e.target.parentNode.nodeName === "LI" &&
      doc === "scene"
    ) {
      if (e.target.parentNode?.classList.contains("directory-item")) {
        id = e.target.parentNode?.getAttribute("data-document-id")
      }
    }
    return id
  }

  window.addEventListener(
    "click",
    async e => {
      let id
      if (doc === "journal page") {
        if (
          e.target.parentElement?.parentElement?.nodeName === "LI" &&
          e.target.parentElement?.parentElement?.getAttribute("data-page-id")
        ) {
          const journalId =
            e.target.parentElement?.parentElement?.parentElement?.parentElement?.parentElement?.parentElement?.parentElement?.parentElement?.id?.split(
              "-",
            )[2]
          // 'JournalEntry.num.JournalEntryPage.num'
          id = `JournalEntry.${journalId}.JournalEntryPage.${e.target.parentElement?.parentElement?.getAttribute("data-page-id")}`
        }
      } else if (doc === "quest") {
        if (
          e.target.parentElement?.nodeName === "DIV" &&
          e.target.parentElement?.getAttribute("data-quest-id")
        ) {
          id = `forien-quest-log.${e.target.parentElement.getAttribute("data-quest-id")}`
        }
      } else if (doc === "journal") {
        id = getId(e, doc)
        if (id) id = `JournalEntry.${id}`
      } else if (tab === "macros") {
        id = getId(e, doc)
        if (id) id = `Macro.${id}`
      } else if (doc === "scene") {
        id = getId(e, doc)
        if (id) id = `Scene.${id}`
      }
      if (id) {
        e.stopPropagation()
        Object.values(ui.windows).forEach(app => app.maximize())
        foundry.applications.instances.forEach(a => a.maximize())
        const frame = iframe.element?.querySelector("iframe")
        if (frame) {
          frame.contentWindow.postMessage({ type: "uuid", uuid: id }, "*")
        }
        controller.abort()
      }
    },
    { signal, capture: true },
  )
}

export async function pickUsers() {
  const users = game.users.filter(user => !user.isSelf && user.active)
  const maps = game.settings.get("map", "maps")
  if (!users.length) {
    ui.notifications.error(`no users online`)
    return [null, null]
  }
  if (!maps.meta.default) {
    ui.notifications.error(`No default map`)
    return [null, null]
  }
  const content = `
    <form>
      <p class="hint">Have selected users view the <b>${maps[maps.meta.default].name}</b> map</p>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px">
        ${users
          .map(
            user => `
          <label style="display: flex; align-items: center; gap: 10px">
            <input type="checkbox" name="selectedUser" value="${user.id}">
            <img src="${user.avatar ?? user.img ?? user.icon}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">
            <span>${user.name}</span>
          </label>
        `,
          )
          .join("")}
      </div>
    </form>
  `
  // TODO: only allow one window
  const confirm = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Pick a user to see map" },
    classes: ["map-prompt"],
    content,
  })
  if (!confirm) return [null, null]
  const uids = [
    ...document.querySelectorAll('input[name="selectedUser"]:checked'),
  ].map(e => e.value)
  return [uids, maps.meta.default]
}

export const rgbToHex = (r, g, b) => {
  const componentToHex = c => {
    const hex = c.toString(16)
    return hex.length === 1 ? "0" + hex : hex
  }
  return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b)
}

export async function ensureSystemMap(maps) {
  let url = ""
  if (game.system.id === "alienrpg") {
    url = `${STARGAZER_URL}/alien`
  } else if (game.system.id === "cyberpunk-red-core") {
    url = `${STARGAZER_URL}/cyberpunk`
  } else if (game.system.id === "dnd5e") {
    url = `${STARGAZER_URL}/dnd`
  } else if (game.system.id === "fallout") {
    url = `${STARGAZER_URL}/fallout`
  } else if (game.system.id === "lancer") {
    url = `${STARGAZER_URL}/lancer`
  } else if (game.system.id === "mosh" || game.system.id === "mothership-fr") {
    url = `${STARGAZER_URL}/mothership`
  } else if (game.system.id === "starwarsffg") {
    url = `${STARGAZER_URL}/starwars`
  } else if (
    game.system.id === "impmal" ||
    game.system.id === "wrath-and-glory"
  ) {
    url = `${STARGAZER_URL}/warhammer`
  } else if (game.system.id === "CoC7") {
    url = `${STARGAZER_URL}/coc`
  } else if (game.system.id === "deltagreen") {
    url = `${STARGAZER_URL}/deltagreen`
  }
  const mapName = url.split("/").pop()
  const hasSystemMap = Object.values(maps).some(m => {
    if (m.map === mapName) return true
  })
  if (url && !hasSystemMap) {
    const id = `${mapName}-${Date.now()}`
    ui.notifications.info("Adding base map for your system " + mapName)
    maps[id] = {
      url: (url += "?iframe=1&tutorial=0&editor=0&skipCreation=1&controls=0"),
      name: `base ${mapName}`,
      map: mapName,
      systemMap: true,
      uuid: id,
    }
    if (Object.keys(maps).length === 2) {
      maps.meta.default = id
    }
    await game.settings.set("map", "maps", maps)
  }
  return maps

  // # popularity
  // https://www.foundryvtt-hub.com/packages/?sort_order=_sfm_installs+desc+num&_sfm_type=system
  // [fantasy] pf2e (pathfinder) = 31%
  // [20s / modern] CoC7 (call of cthulhu 7e) = 6.5%
  // [modern] swade (savage worlds) = 4.7%
  // [fantasy] wfrp4e (warhammer fantasy) = 4.5%
  // [fantasy] pf1 (pathfinder 1e) = 4.4%
  // [scifi] sfrpg (starfinder) = 4.3%
  // [scifi] lancer = 4.3%
  // [scifi earth] RED = 4.1%
  // [scifi] star wars = 3.7%
  // [scifi] alien = 3.2%
  // [fantasy] forbidden-lands (forbidden lands) = 2.1%
  // [scifi] wrath-and-glory (warhammer WG) = 2%
  // [modern] deltagreen (dela green) = 2%
  // [scifi] shadowrun5e (shadowrun) = 1.9% [there is as 6e but most play 5e]
  // [modern] fallout = 1.7%
  // [scifi] MoSh = 1.3%
  // [scifi] mgt2e (traveller) = 1.2 % (skip)

  // shadowdark
  // "blade-runner"
}

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

export const genUuid = size => {
  return [...crypto.getRandomValues(new Uint8Array(size))]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
}

export const DEFAULTS = map => {
  const defaults = {
    autoWidth: 2000,
    autoHeight: 2000,
    autoLat: 0,
    autoLng: 0,
    autoZoom: 1,
    background: "#031221", // blue
  }
  if (map === "fallout") {
    return {
      ...defaults,
      autoWidth: 2200,
      autoHeight: 1600,
      autoZoom: 5,
      autoLng: -96,
      autoLat: 36,
      background: "#0a150a", // green
    }
  }
  return defaults
}

const colors = [
  "rgba(239, 68, 68, 0.2)", // red
  "rgba(249, 115, 22, 0.2)", // orange
  "rgba(234, 179, 8, 0.2)", // yellow
  "rgba(17, 246, 30, 0.2)", // green
  "rgba(16, 185, 129, 0.2)", // teal
  "rgba(6, 182, 212, 0.2)", // cyan
  "rgba(14, 165, 233, 0.2)", // sky blue
  "rgba(59, 130, 246, 0.2)", // blue
  "rgba(99, 102, 241, 0.2)", // indigo
  "rgba(139, 92, 246, 0.2)", // violet
  "rgba(168, 85, 247, 0.2)", // purple
  "rgba(217, 70, 239, 0.2)", // fuchsia
  "rgba(236, 72, 153, 0.2)", // pink
  "rgba(244, 63, 94, 0.2)", // rose
  "rgba(20, 184, 166, 0.2)", // aqua
  "rgba(12, 204, 22, 0.07)", // forest
]
export function hashStringToColor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}
