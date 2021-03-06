/**
* @file Contains all main code
* @author yafp
* @namespace main
*/

'use strict'

// ----------------------------------------------------------------------------
// REQUIRE: TTTH MODULES
// ----------------------------------------------------------------------------
const urls = require('./app/js/ttth/modules/urlsGithub.js')
const crash = require('./app/js/ttth/modules/crashReporter.js') // crashReporter
const sentry = require('./app/js/ttth/modules/sentry.js') // sentry
const unhandled = require('./app/js/ttth/modules/unhandled.js') // electron-unhandled

// -----------------------------------------------------------------------------
// REQUIRE: 3rd PARTY
// -----------------------------------------------------------------------------
const { app, BrowserWindow, Menu, Tray, ipcMain, globalShortcut } = require('electron')
const log = require('electron-log') // for: logging to file
const shell = require('electron').shell // for: opening external urls in default browser
const isOnline = require('is-online') // for online connectivity checks
const path = require('path')
const fs = require('fs')
const os = require('os') // for: check os.platform()
const openAboutWindow = require('about-window').default // for: about-window
require('v8-compile-cache') // via: https://dev.to/xxczaki/how-to-make-your-electron-app-faster-4ifb

// ----------------------------------------------------------------------------
// ERROR-HANDLING:
// ----------------------------------------------------------------------------
crash.initCrashReporter()
unhandled.initUnhandled()
sentry.enableSentry() // sentry is enabled by default

// -----------------------------------------------------------------------------
// VARIABLES
// -----------------------------------------------------------------------------

// Keep a global reference of the window objects, if you don't, the window
// will be closed automatically when the JavaScript object is garbage collected.
let mainWindow = null
let configWindow = null
// let windowConfig = null // gonna implement this in 1.10.0

const gotTheLock = app.requestSingleInstanceLock() // for: single-instance handling
const defaultUserDataPath = app.getPath('userData') // for: storing window position and size
const userOSPlatform = os.platform() // for BadgeCount support - see #152

let verbose = false

var defaultMainWindowWidth = 800
var defaultMainWindowHeight = 600

// -----------------------------------------------------------------------------
// FUNCTIONS
// -----------------------------------------------------------------------------

/**
* @function writeLog
* @summary Writes to log file (and if verbose parameter is given as well to console)
* @description Writes to log file (and if verbose parameter is given as well to console)
* @memberof main
*/
function writeLog (logType, logMessage) {
    // configure
    log.transports.file.level = true // logging to file
    log.transports.console.level = false // logging to console (default)

    // enable output to console if verbose parameter is given
    if (verbose === true) {
        log.transports.console.level = true
    }

    logMessage = '[   Main   ] ' + logMessage // add prefix for all logs from [M]ain

    // do log
    switch (logType) {
    case 'info':
        log.info(logMessage)
        break

    case 'warn':
        log.warn(logMessage)
        break

    case 'error':
        log.error(logMessage)
        break

    default:
        log.info(logMessage)
    }
}

/**
* @function checkNetworkConnectivity
* @summary Checks if internet is accessible
* @description Checks if the internet is accessible, if not triggers an error in the mainWindow
* @memberof main
*/
function checkNetworkConnectivity () {
    (async () => {
        if (await isOnline() === true) {
            writeLog('info', 'checkNetworkConnectivity ::: Got access to the internet.')
        } else {
            writeLog('error', 'checkNetworkConnectivity ::: Got NO access to the internet.')
            mainWindow.webContents.send('showNoConnectivityError') // app should show an error
        }
    })()
}

/**
* @function checkArguments
* @summary Parses the supplied parameters
* @description Parses the supplied parameters
* @memberof main
*/
function checkArguments () {
    // using https://www.npmjs.com/package/minimist could improve handling

    // log.info(process.argv);
    // ignore the first 2 arguments
    // log.info(process.argv.slice(2));
    process.argv = process.argv.slice(2)

    for (var key in process.argv) {
        if (process.argv.hasOwnProperty(key)) {
            // console.log(key + " -> " + process.argv[key]);
            switch (process.argv[key]) {
            case 'verbose':
                verbose = true
                log.info('[M] Enabling verbose/debug mode')
                writeLog('info', 'checkArguments ::: Enabling verbose mode')
                break

            default:
                log.warn('[M] Ignoring unsupported parameter: _' + process.argv[key] + '_.') // nothing to do here
                break
            }
        }
    }
}

/**
* @function showDialog
* @summary Shows a dialog
* @description Displays a dialog - see https://electronjs.org/docs/api/dialog
* @memberof main
* @param {string} dialogType - Can be "none", "info", "error", "question" or "warning"
* @param {string} dialogTitle - The title text
* @param {string} dialogMessage - The message of the dialog
* @param {string} dialogDetail - The detail text
*/
function showDialog (dialogType, dialogTitle, dialogMessage, dialogDetail) {
    const { dialog } = require('electron')
    const options = {
        type: dialogType,
        buttons: ['OK'],
        defaultId: 2,
        title: dialogTitle,
        message: dialogMessage,
        detail: dialogDetail
    }

    dialog.showMessageBox(null, options, (response, checkboxChecked) => {
        // console.log(response);
    })
}

/**
* @function createTray
* @summary Creates the tray of the app
* @description Creates the tray and the related menu.
* @memberof main
*/
function createTray () {
    writeLog('info', 'createTray ::: Starting to create a tray item')

    let tray = null
    tray = new Tray(path.join(__dirname, 'app/img/tray/tray_default.png'))

    const contextMenu = Menu.buildFromTemplate([
        {
            // Window focus
            id: 'show',
            label: 'Show',
            click: function () {
                if (mainWindow === null) {
                    // #134
                    // do nothing, as no mainWindow exists. Most likely on macOS
                } else {
                    // focus the main window
                    if (mainWindow.isMinimized()) {
                        mainWindow.restore()
                    } else {
                        // is not minimized. Was maybe: hidden via hide()
                        mainWindow.show()
                    }
                    mainWindow.focus()
                }
            },
            enabled: true
        },
        {
            type: 'separator',
            enabled: false
        },
        {
            // Quit
            id: 'exit',
            label: 'Exit',
            enabled: true,
            click: function () {
                app.quit()
            }
        }
    ])

    tray.setToolTip('ttth')
    tray.setContextMenu(contextMenu)

    writeLog('info', 'createTray ::: Finished creating tray')

    // Call from renderer: Change Tray Icon to UnreadMessages
    ipcMain.on('changeTrayIconToUnreadMessages', function () {
        if (tray.isDestroyed() === false) {
            tray.setImage(path.join(__dirname, 'app/img/tray/tray_unread.png'))
        }
    })

    // Call from renderer: Change Tray Icon to Default
    ipcMain.on('changeTrayIconToDefault', function () {
        if (tray.isDestroyed() === false) {
            tray.setImage(path.join(__dirname, 'app/img/tray/tray_default.png'))
        }
    })

    // Call from renderer: Option: Urgent window - see #110
    ipcMain.on('makeWindowUrgent', function () {
        mainWindow.flashFrame(true) // #110 - urgent window
    })

    // Call from renderer: Option: DisableTray
    ipcMain.on('disableTray', function () {
        writeLog('info', 'createTray ::: Disabling tray (ipcMain)')
        tray.destroy()
        if (tray.isDestroyed() === true) {
            writeLog('info', 'createTray ::: Disabling tray was working')
        } else {
            writeLog('error', 'Disabling tray failed')
        }
    })
}

/**
* @function createWindowConfig
* @summary Creates the config window  of the app
* @description Creates the config window
* @memberof main
*/
/*
function createWindowConfig () {
    writeLog('info', 'createWindow ::: Starting to create the application windows')

    // Create the browser window.
    windowConfig = new BrowserWindow({
        // parent: mainWindow,
        modal: true,
        frame: true, // false results in a borderless window. Needed for custom titlebar
        titleBarStyle: 'default', // needed for custom-electron-titlebar. See: https://electronjs.org/docs/api/frameless-window
        backgroundColor: '#ffffff',
        show: true,
        center: true, // Show window in the center of the screen
        width: 800,
        minWidth: 800,
        // resizable: false, // this conflickts with opening dev tools
        minimizable: false, // not implemented on linux
        maximizable: false, // not implemented on linux
        height: 700,
        minHeight: 700,
        icon: path.join(__dirname, 'app/img/icon/icon.png'),
        webPreferences: {
            nodeIntegration: true,
            webSecurity: true // introduced in 0.3.0
        }
    })

    // and load the setting.html of the app.
    windowConfig.loadFile('app/configWindow.html')

    // window needs no menu
    windowConfig.removeMenu()

    // Call from renderer: Settings UI - toggle dev tools
    ipcMain.on('settingsToggleDevTools', function () {
        settingsWindow.webContents.toggleDevTools()
    })

    // Emitted before the window is closed.
    windowConfig.on('close', function () {
        writeLog('info', 'createWindowConfig ::: windowConfig will close (event: close)')
    })

    // Emitted when the window is closed.
    windowConfig.on('closed', function (event) {
        writeLog('info', 'createWindowConfig ::: windowConfig is closed (event: closed)')
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        windowConfig = null

        // unblur main UI
        mainWindow.webContents.send('unblurMainUI')
    })
}
*/

/**
* @function createWindow
* @summary Creates the main window  of the app
* @description Creates the main window, restores window position and size of possible
* @memberof main
*/
function createWindow () {
    writeLog('info', 'createWindow ::: Starting to create the application windows')

    // Variables for window position and size
    var windowWidth
    var windowHeight
    var windowPositionX
    var windowPositionY

    // Try to read stored last window position and size
    var customUserDataPath = path.join(defaultUserDataPath, 'ttthMainWindowPosSize.json')
    var data
    try {
        data = JSON.parse(fs.readFileSync(customUserDataPath, 'utf8'))

        // size
        windowWidth = data.bounds.width
        windowHeight = data.bounds.height

        // position
        windowPositionX = data.bounds.x
        windowPositionY = data.bounds.y

        writeLog('info', 'createWindow ::: Got last window position and size information from _' + customUserDataPath + '_.')
    } catch (e) {
        writeLog('warn', 'createWindow ::: No last window position and size information found in _' + customUserDataPath + '_. Using fallback values')

        // set some default values for window size
        windowWidth = defaultMainWindowWidth
        windowHeight = defaultMainWindowHeight
    }

    // Create the browser window.
    mainWindow = new BrowserWindow({
        // title: '${productName}',
        frame: false, // false results in a borderless window
        show: false, // hide until: ready-to-show
        titleBarStyle: 'hidden', // needed for custom-electron-titlebar
        width: windowWidth,
        height: windowHeight,
        minWidth: defaultMainWindowWidth,
        minHeight: defaultMainWindowHeight,
        center: true, // Show window in the center of the screen. (since 1.7.0)
        backgroundColor: '#ffffff',
        icon: path.join(__dirname, 'app/img/icon/icon.png'),
        webPreferences: {
            nodeIntegration: true,
            webSecurity: true, // introduced in 1.8.0
            experimentalFeatures: false, // introduced in 1.8.0
            webviewTag: true, // # see #37
            devTools: true, // should be possible to open them
            partition: 'ttth'
        }
    })

    writeLog('info', 'createWindow ::: Finished creating the mainWindow')

    // Restore window position if possible
    // requirements: found values in .ttthMainWindowPosSize.json from the previous session
    //
    if ((typeof windowPositionX !== 'undefined') && (typeof windowPositionY !== 'undefined')) {
        writeLog('info', 'createWindow ::: Restoring last stored window-position of mainWindow')
        mainWindow.setPosition(windowPositionX, windowPositionY)
    }

    // Call from renderer: Update property from globalObj
    ipcMain.on('globalObjectSet', function (event, property, value) {
        writeLog('info', 'Set property _' + property + '_ to new value: _' + value + '_')
        global.sharedObj[property] = value
        // console.warn(global.sharedObj) // show entire globalOBject on each set command
    })

    // Global object
    //
    // Settings Tab
    var settingDefaultView = ''
    var settingTheme = 'default'
    var settingAutostart = ''
    var settingDisableTray = false
    var settingUrgentWindow = false
    var settingEnableErrorReporting = true
    var settingEnablePrereleases = false

    global.sharedObj = {
        settingDefaultView: settingDefaultView,
        settingTheme: settingTheme,
        settingAutostart: settingAutostart,
        settingDisableTray: settingDisableTray,
        settingUrgentWindow: settingUrgentWindow,
        settingEnableErrorReporting: settingEnableErrorReporting,
        settingEnablePrereleases: settingEnablePrereleases
    }

    // Load the UI (mainWindow.html) of the app.
    mainWindow.loadFile('./app/mainWindow.html')
    writeLog('info', 'createWindow ::: Loading mainWindow.html to mainWindow')

    // show the formerly hidden main window as it is fully ready now
    mainWindow.on('ready-to-show', function () {
        mainWindow.show()
        mainWindow.focus()
        writeLog('info', 'createWindow ::: mainWindow is now ready, so show it and then focus it (event: ready-to-show)')

        checkNetworkConnectivity() // check network access
    })

    // Emitted when the application has finished basic startup.
    mainWindow.on('will-finish-launching', function () {
        writeLog('info', 'createWindow ::: mainWindow will finish launching (event: will-finish-launching)')
    })

    // When dom is ready
    mainWindow.webContents.once('dom-ready', () => {
        writeLog('info', 'createWindow ::: mainwWindow DOM is now ready (event: dom-ready)')
    })

    // When page title gets changed
    mainWindow.webContents.once('page-title-updated', () => {
        writeLog('info', 'createWindow ::: mainWindow got new title (event: page-title-updated)')
    })

    // when the app is shown
    mainWindow.on('show', function () {
        writeLog('info', 'createWindow ::: mainWindow is visible (event: show)')
    })

    // when the app loses focus / aka blur
    mainWindow.on('blur', function () {
        writeLog('info', 'createWindow ::: mainWindow lost focus (event: blur)')
    })

    // when the app gets focus
    mainWindow.on('focus', function () {
        writeLog('info', 'createWindow ::: mainWindow got focus (event: focus)')
    })

    // when the app goes fullscreen
    mainWindow.on('enter-full-screen', function () {
        writeLog('info', 'createWindow ::: mainWindow is now in fullscreen (event: enter-full-screen)')
    })

    // when the app goes leaves fullscreen
    mainWindow.on('leave-full-screen', function () {
        // disabled to reduce clutter
        // writeLog("info", "mainWindow leaved fullscreen (event: leave-full-screen)");
    })

    // when the app gets resized
    mainWindow.on('resize', function () {
        // disabled to reduce clutter
        // writeLog("info", "mainWindow got resized (event: resize)");
    })

    // when the app gets hidden
    mainWindow.on('hide', function () {
        writeLog('info', 'createWindow ::: mainWindow is now hidden (event: hide)')
    })

    // when the app gets maximized
    mainWindow.on('maximize', function () {
        writeLog('info', 'createWindow ::: mainWindow is now maximized (event: maximized)')
    })

    // when the app gets unmaximized
    mainWindow.on('unmaximize', function () {
        writeLog('info', 'createWindow ::: mainWindow is now unmaximized (event: unmaximized)')
    })

    // when the app gets minimized
    mainWindow.on('minimize', function () {
        writeLog('info', 'createWindow ::: mainWindow is now minimized (event: minimize)')
    })

    // when the app gets restored from minimized mode
    mainWindow.on('restore', function () {
        writeLog('info', 'createWindow ::: mainWindow is now restored (event: restore)')
    })

    mainWindow.on('app-command', function () {
        writeLog('info', 'createWindow ::: mainWindow got app-command (event: app-command)')
    })

    // Emitted before the window is closed.
    mainWindow.on('close', function () {
        writeLog('info', 'createWindow ::: mainWindow will close (event: close)')

        // get current window position and size
        var data = {
            bounds: mainWindow.getBounds()
        }

        // define target path (in user data) to store rthe values
        var customUserDataPath = path.join(defaultUserDataPath, 'ttthMainWindowPosSize.json')

        // try to write the window position and size to preference file
        fs.writeFile(customUserDataPath, JSON.stringify(data), function (err) {
            if (err) {
                writeLog('error', 'storing window-position and -size of mainWindow in  _' + customUserDataPath + '_ failed with error: _' + err + '_ (event: close)')
                return console.log(err)
            }

            writeLog('info', 'mainWindow stored window-position and -size in _' + customUserDataPath + '_ (event: close)')
        })
    })

    // Emitted when the window is closed.
    mainWindow.on('closed', function () {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null
        writeLog('info', 'createWindow ::: mainWindow is now closed (event: closed)')
    })

    // When the app is unresponsive
    mainWindow.on('unresponsive', function () {
        writeLog('error', 'createWindow ::: mainWindow is now unresponsive (event: unresponsive)')
        showDialog('error', 'Alert', 'ttth seems unresponsive', 'Consider restarting the app')
    })

    // When the app gets responsive again
    mainWindow.on('responsive', function () {
        writeLog('info', 'createWindow ::: mainWindow is now responsive again (event: responsive)')
    })

    // When the app is crashed
    mainWindow.webContents.on('crashed', function () {
        writeLog('info', 'createWindow ::: mainWindow crashed (event: crashed)')
        showDialog('error', 'Alert', 'ttth just crashed', 'Consider reporting this issue')
    })

    // Call from renderer: Reload mainWindow
    ipcMain.on('reloadMainWindow', (event) => {
        mainWindow.reload()
        writeLog('info', 'createWindow ::: mainWindow is now reloaded (ipcMain)')
    })

    // Call from renderer: Open folder with user configured services
    ipcMain.on('openUserServicesConfigFolder', (event) => {
        var customUserDataPath = path.join(defaultUserDataPath, 'storage')
        if (shell.openItem(customUserDataPath) === true) {
            writeLog('info', 'createWindow ::: ServiceConfigs: Opened the folder _' + customUserDataPath + '_ which contains all user-configured services (ipcMain)')
        } else {
            writeLog('warn', 'createWindow ::: ServiceConfigs: Failed to open the folder _' + customUserDataPath + '_ (which contains all user-configured services). (ipcMain)')
        }
    })

    // Call from renderer: Open folder with user settings
    ipcMain.on('openUserSettingsConfigFolder', (event) => {
        var customUserDataPath = path.join(defaultUserDataPath, 'ttthUserSettings')
        if (shell.openItem(customUserDataPath) === true) {
            writeLog('info', 'createWindow ::: UserSettings: Opened the folder _' + customUserDataPath + '_ which contains all user-configured services (ipcMain)')
        } else {
            writeLog('warn', 'createWindow ::: UserSettings: Failed to open the folder _' + customUserDataPath + '_ (which contains all user-configured services). (ipcMain)')
        }
    })

    // Call from renderer ::: deleteAllGlobalServicesShortcut
    ipcMain.on('deleteAllGlobalServicesShortcut', function (arg1, numberOfEnabledServices) {
        globalShortcut.unregisterAll() // doesnt work - whyever
        writeLog('info', 'createWindow ::: Shortcuts: Deleting all global service shortcut at once.')

        // delete all global shortcuts manually
        /*
        var i;
        for (i = 1; i <= numberOfEnabledServices;  i++)
        {
            globalShortcut.unregister("CmdOrCtrl+" + i);
            writeLog("info", "createWindow ::: Shortcuts: Deleting the global service shortcut: CmdOrCtrl+" + i);
        }
        */
        writeLog('info', 'createWindow ::: Shortcuts: Finished deleting all global service shortcuts (ipcMain)')
    })

    // Call from renderer ::: createNewGlobalShortcut
    ipcMain.on('createNewGlobalShortcut', function (arg1, shortcut, targetTab) {
        writeLog('info', 'createWindow ::: Shortcuts: Creating a new shortcut: _' + shortcut + '_ for the service/tab: _' + targetTab + '_.')

        // const ret = globalShortcut.register(shortcut, () => {
        globalShortcut.register(shortcut, () => {
            writeLog('error', 'Shortcut: _' + shortcut + '_ was pressed.')

            mainWindow.webContents.send('switchToTab', targetTab) // activate the related tab
        })
    })

    // Call from renderer: should ttth update the app badge count
    // is supported for macOS & Linux (running Unity)
    ipcMain.on('updateBadgeCount', (event, arg) => {
        var environmentSupported = false

        // Possible values are 'aix', 'darwin', 'freebsd', 'linux', 'openbsd', 'sunos', and 'win32'.
        switch (userOSPlatform) {
        case 'darwin':
            environmentSupported = true
            break

        case 'linux':
            var checkForUnity = app.isUnityRunning()
            if (checkForUnity === true) {
                environmentSupported = true
            }
            break

        default:
                // do nothing
        }

        // if the environment supports BadgeCount - update it
        if (environmentSupported === true) {
            // check current badge count
            var currentBadgeCount = app.getBadgeCount() // FIXME: deprecated - Please use 'badgeCount property' instead.

            // if badge count has to be updated - try to update it
            if (currentBadgeCount !== arg) {
                var didUpdateBadgeCount = app.setBadgeCount(arg) // FIXME: deprecated.- Please use 'badgeCount property' instead.
                if (didUpdateBadgeCount === true) {
                    writeLog('info', 'createWindow ::: Updating application badge count to _' + arg + '_.') // updating badge count worked
                } else {
                    writeLog('warn', 'createWindow ::: Updating application badge count to _' + arg + '_ failed.') // updating badge count failed
                }
            }
        }
    })

    // *****************************************************************
    // modal window: to allow creating and configuring a single service
    // *****************************************************************
    //
    configWindow = new BrowserWindow({
        parent: mainWindow,
        modal: true, // Whether this is a modal window. This only works when the window is a child window
        // title: '${productName}',
        frame: false, // false results in a borderless window
        show: false, // hide as default
        titleBarStyle: 'hidden',
        resizable: false,
        width: 600,
        height: 650,
        minWidth: 600,
        minHeight: 650,
        backgroundColor: '#ffffff',
        icon: path.join(__dirname, 'app/img/icon/icon.png'),
        webPreferences: {
            nodeIntegration: true,
            webviewTag: true // see #37
        }
    })

    writeLog('info', 'createWindow ::: Finished creating configWindow')

    // load html form to the window
    configWindow.loadFile('app/configWindow.html')
    writeLog('info', 'createWindow ::: Loaded configWindow.html to configWindow')

    // hide menubar
    configWindow.setMenuBarVisibility(false)
    writeLog('info', 'createWindow ::: Hiding menubar of configWindow')

    // Emitted when the window gets a close event.(close VS closed)
    configWindow.on('close', function (event) {
        writeLog('info', 'configWindow will close, but we hide it (event: close)')
        configWindow.hide() // just hide it - so it can re-opened
    })

    // Emitted when the window is ready to be shown
    configWindow.on('ready-to-show', function (event) {
        writeLog('info', 'configWindow is now ready to show (event: ready-to-show)')

        // do some checks & routines once at start of the application
        mainWindow.webContents.send('startSearchUpdatesSilent') // search silently for ttth updates
    })

    // Emitted when the window is shown
    configWindow.on('show', function (event) {
        writeLog('info', 'configWindow is now shown (event: show)')
    })

    // Call from renderer: show configure-single-service window for a new service
    ipcMain.on('showConfigureSingleServiceWindowNew', (event, arg) => {
        writeLog('info', 'configWindow preparing for new service creation. (ipcMain)')

        // show window
        configWindow.show()
        configWindow.webContents.send('serviceToCreate', arg)
    })

    // Call from renderer: show configure-single-service window
    ipcMain.on('showConfigureSingleServiceWindow', (event, arg) => {
        writeLog('info', 'configWindow preparing for service editing (ipcMain)')

        // show window
        configWindow.show()
        configWindow.webContents.send('serviceToConfigure', arg)
    })

    // Call from renderer: hide configure-single-service window
    ipcMain.on('closeConfigureSingleServiceWindow', (event) => {
        configWindow.hide() // hide window
        writeLog('info', 'configWindow is now hidden (ipcMain)')
    })

    // Call from renderer: Tray: RecreateTray
    ipcMain.on('recreateTray', function () {
        writeLog('info', 'Recreating tray (ipcMain)')
        createTray()
    })

    writeLog('info', 'createWindow ::: Finished creating mainWindow and configWindow')
}

/**
* @function forceSingleAppInstance
* @summary Takes care that there is only 1 instance of this app running
* @description Takes care that there is only 1 instance of this app running
* @memberof main
*/
function forceSingleAppInstance () {
    writeLog('info', 'forceSingleAppInstance ::: Checking if there is only 1 instance of ttth')

    if (!gotTheLock) {
        writeLog('error', 'forceSingleAppInstance ::: There is already another instance of ttth')
        app.quit() // quit the second instance
    } else {
        app.on('second-instance', (event, commandLine, workingDirectory) => {
            // Someone tried to run a second instance, we should focus our first instance window.
            if (mainWindow) {
                // #134
                if (mainWindow === null) {
                    // do nothing - there is no mainwindow - most likely we are on macOS
                } else {
                    // mainWindow exists
                    if (mainWindow.isMinimized()) {
                        mainWindow.restore()
                    }
                    mainWindow.focus()
                }
            }
        })
    }
}

/**
* @function createMenu
* @summary Creates the application menu
* @description Creates the application menu
* @memberof main
*/
function createMenu () {
    // Create a custom menu
    var menu = Menu.buildFromTemplate([

        // Menu: File
        {
            label: 'File',
            submenu: [
                // Settings
                {
                    label: 'Settings',
                    click (item, mainWindow) {
                        mainWindow.webContents.send('showSettings')
                    },
                    accelerator: 'CmdOrCtrl+,'
                },
                // Separator
                {
                    type: 'separator'
                },
                // Exit
                {
                    role: 'quit',
                    label: 'Exit',
                    click () {
                        app.quit()
                    },
                    accelerator: 'CmdOrCtrl+Q'
                }
            ]
        },

        // Menu: Edit
        {
            label: 'Edit',
            submenu: [
                {
                    label: 'Undo',
                    accelerator: 'CmdOrCtrl+Z',
                    selector: 'undo:'
                },
                {
                    label: 'Redo',
                    accelerator: 'Shift+CmdOrCtrl+Z',
                    selector: 'redo:'
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Cut',
                    accelerator: 'CmdOrCtrl+X',
                    selector: 'cut:'
                },
                {
                    label: 'Copy',
                    accelerator: 'CmdOrCtrl+C',
                    selector: 'copy:'
                },
                {
                    label: 'Paste',
                    accelerator: 'CmdOrCtrl+V',
                    selector: 'paste:'
                },
                {
                    label: 'Select All',
                    accelerator: 'CmdOrCtrl+A',
                    selector: 'selectAll:'
                }
            ]
        },

        // Menu: View
        {
            label: 'View',
            submenu: [
                {
                    label: 'Next Service',
                    click (item, mainWindow) {
                        mainWindow.webContents.send('nextTab')
                    },
                    accelerator: 'CmdOrCtrl+right'
                },
                {
                    label: 'Previous Service',
                    click (item, mainWindow) {
                        mainWindow.webContents.send('previousTab')
                    },
                    accelerator: 'CmdOrCtrl+left'
                },
                {
                    type: 'separator'
                },
                {
                    role: 'reload',
                    label: 'Reload',
                    click (item, mainWindow) {
                        mainWindow.reload()
                    },
                    accelerator: 'CmdOrCtrl+R'
                },
                {
                    label: 'Reload current service',
                    click (item, mainWindow) {
                        mainWindow.webContents.send('reloadCurrentService')
                    },
                    accelerator: 'CmdOrCtrl+S',
                    enabled: true
                }
            ]
        },

        // Menu: Window
        {
            label: 'Window',
            submenu: [
                {
                    role: 'togglefullscreen',
                    label: 'Toggle Fullscreen',
                    click (item, mainWindow) {
                        if (mainWindow.isFullScreen()) {
                            mainWindow.setFullScreen(false)
                        } else {
                            mainWindow.setFullScreen(true)
                        }
                    },
                    accelerator: 'F11' // is most likely predefined on osx - results in: doesnt work on osx
                },
                {
                    role: 'hide',
                    label: 'Hide',
                    click (item, mainWindow) {
                        mainWindow.hide()
                        // mainWindow.reload();
                    },
                    accelerator: 'CmdOrCtrl+H',
                    enabled: true
                },
                {
                    role: 'minimize',
                    label: 'Minimize',
                    click (item, mainWindow) {
                        if (mainWindow.isMinimized()) {
                            // mainWindow.restore();
                        } else {
                            mainWindow.minimize()
                        }
                    },
                    accelerator: 'CmdOrCtrl+M'
                },
                {
                    label: 'Maximize',
                    click (item, mainWindow) {
                        if (mainWindow.isMaximized()) {
                            mainWindow.unmaximize()
                        } else {
                            mainWindow.maximize()
                        }
                    },
                    accelerator: 'CmdOrCtrl+K'
                }
            ]
        },

        // Menu: Help
        {
            role: 'help',
            label: 'Help',
            submenu: [
                // About
                {
                    role: 'about',
                    label: 'About',
                    click () {
                        openAboutWindow({
                            icon_path: path.join(__dirname, 'app/img/about/icon_about.png'),
                            open_devtools: false,
                            use_version_info: true,
                            win_options: // https://github.com/electron/electron/blob/master/docs/api/browser-window.md#new-browserwindowoptions
                    {
                        autoHideMenuBar: true,
                        titleBarStyle: 'hidden',
                        minimizable: false, // not implemented on linux
                        maximizable: false, // not implemented on linux
                        movable: false, // not implemented on linux
                        resizable: false,
                        alwaysOnTop: true,
                        fullscreenable: false,
                        skipTaskbar: false
                    }
                        })
                    }
                },
                // open homepage
                {
                    label: 'Homepage',
                    click () {
                        shell.openExternal(urls.urlGitHubGeneral)
                    },
                    accelerator: 'F1'
                },
                // report issue
                {
                    label: 'Report issue',
                    click () {
                        shell.openExternal(urls.urlGitHubIssues)
                    },
                    accelerator: 'F2'
                },
                // open changelog
                {
                    label: 'Changelog',
                    click () {
                        shell.openExternal(urls.urlGitHubChangelog)
                    },
                    accelerator: 'F3'
                },
                // open FAQ
                {
                    label: 'FAQ',
                    click () {
                        shell.openExternal(urls.urlGitHubFAQ)
                    },
                    accelerator: 'F4'
                },
                // open Releases
                {
                    label: 'Releases',
                    click () {
                        shell.openExternal(urls.urlGitHubReleases)
                    },
                    accelerator: 'F5'
                },
                {
                    type: 'separator'
                },
                // Update
                {
                    label: 'Search updates',
                    click (item, mainWindow) {
                        mainWindow.webContents.send('startSearchUpdates')
                    },
                    enabled: true,
                    accelerator: 'F9'
                },
                {
                    type: 'separator'
                },

                // SubMenu Console
                {
                    label: 'Console',
                    submenu: [
                        // console for current service
                        {
                            id: 'HelpConsoleCurrentService',
                            label: 'Console for current service',
                            click (item, mainWindow) {
                                mainWindow.webContents.send('openDevToolForCurrentService')
                            },
                            enabled: true,
                            accelerator: 'F10'
                        },
                        // Console
                        {
                            id: 'HelpConsole',
                            label: 'Console',
                            click (item, mainWindow) {
                                mainWindow.webContents.toggleDevTools()
                            },
                            enabled: true,
                            accelerator: 'F12'
                        }
                    ]
                },
                {
                    type: 'separator'
                },
                // SubMenu of help
                {
                    label: 'Maintenance',
                    submenu: [
                        // Clear cache in userData
                        {
                            id: 'ClearCache',
                            label: 'Clear cache',
                            click (item, mainWindow) {
                                var chromeCacheDir = path.join(app.getPath('userData'), 'Cache')
                                if (fs.existsSync(chromeCacheDir)) {
                                    var files = fs.readdirSync(chromeCacheDir)
                                    for (var i = 0; i < files.length; i++) {
                                        var filename = path.join(chromeCacheDir, files[i])
                                        if (fs.existsSync(filename)) {
                                            try {
                                                fs.unlinkSync(filename)
                                            } catch (e) {
                                                console.log(e)
                                            }
                                        }
                                    }
                                }

                                mainWindow.reload()
                            },
                            enabled: true
                        }
                    ]
                }
            ]
        }
    ])

    // use the menu
    Menu.setApplicationMenu(menu)

    // OPTIONAL & currently not in use:
    //
    // Disable some menu-elements - depending on the platform
    //
    /*
    var os = require("os");
    Menu.getApplicationMenu().items; // all the items

    // macos specific

    if(os.platform() === "darwin")
    {
        // see #21 - disable the menuitem Toggle-menubar
        //var item = Menu.getApplicationMenu().getMenuItemById("ViewToggleMenubar");
        //item.enabled = false;
    }

    // linux  specific
    if(os.platform() === "linux")
    {
        // nothing to do so far
    }

    // windows specific
    if(os.platform() === "windows")
    {
        // nothing to do so far
    }
    */
}

// -----------------------------------------------------------------------------
// LETS GO
// -----------------------------------------------------------------------------

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
//
app.on('ready', function () {
    checkArguments() // check input arguments
    writeLog('info', 'app got ready signal (event: ready)')
    forceSingleAppInstance() // check for single instance
    createWindow() // create the application UI
    createMenu() // create the application menu
    createTray() // create the tray
})

// Emitted while app tries to do a basic auth (https://electronjs.org/docs/api/app#event-login)
app.on('login', function () {
    writeLog('info', 'app tries to do basic auth (event: login)')
})

// Emitted before the application starts closing its windows.
app.on('before-quit', function () {
    writeLog('info', 'app is preparing to quit (event: before-quit)')
})

// Emitted when all windows have been closed and the application will quit.
app.on('will-quit', function () {
    writeLog('info', 'app will quit (event: will-quit)')
})

// Emitted when the application is quitting.
app.on('quit', function () {
    writeLog('info', 'app got quit event (event: quit)')
})

// Emitted when a browserWindow gets blurred. (loosing focus)
app.on('browser-window-blur', function () {
    // writeLog("info", "app lost focus (event: browser-window-blur)");
})

// Emitted when a browserWindow gets focused.
app.on('browser-window-focus', function () {
    // disabled to reduce clutter
    // writeLog("info", "app got focus (event: browser-window-focus)");
})

// Emitted when failed to verify the certificate for url, to trust the certificate you should prevent the default behavior with event.preventDefault() and call callback(true).
app.on('certificate-error', function () {
    writeLog('info', 'app failed to verify a cert (event: certificate-error)')
})

// Emitted when remote.require() is called in the renderer process of webContents.
app.on('remote-require', function () {
    writeLog('info', 'app called .require() in the renderer process (event: remote-require)')
})

// Emitted when remote.getGlobal() is called in the renderer process of webContents.
app.on('remote-get-global', function () {
    // writeLog("info", "app called .getGlobal() in the renderer process (event: remote-get-global)");
})

// Emitted when remote.getBuiltin() is called in the renderer process of webContents.
app.on('remote-get-builtin', function () {
    // disabled to reduce clutter
    // writeLog("info", "app called .getBuiltin() in the renderer process (event: remote-get-builtin)");
})

// Emitted when remote.getCurrentWindow() is called in the renderer process of webContents.
app.on('remote-get-current-window', function () {
    // writeLog("info", "app called .getCurrentWindow() in the renderer process(event: remote-get-current-window)");
})

// Emitted when remote.getCurrentWebContents() is called in the renderer process of webContents
app.on('remote-get-current-web-contents', function () {
    writeLog('info', 'app called .getCurrentWebContents() in the renderer process (event: remote-get-current-web-contents)')
})

// Quit when all windows are closed.
app.on('window-all-closed', function () {
    writeLog('info', 'app closed all application windows (event: window-all-closed)')

    // On macOS it is common for applications and their menu bar to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        writeLog('info', 'Bye')
        app.quit()
    }

    // we handle all systemes the same - this means: close the mainWindow = the app closes as well -  why: see #134
    // writeLog("info", "Bye");
    // app.quit();
})

// activate = macOS only:
// Emitted when the application is activated. Various actions can trigger this event, such as launching the application for the first time,
// attempting to re-launch the application when it's already running, or clicking on the application's dock or taskbar icon.
app.on('activate', function () {
    writeLog('info', 'app got activate event (event: activate)')

    // On macOS it's common to re-create a window in the app when the dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
        writeLog('warn', 'Trying to re-create the mainWindow, as it doesnt exist anymore (event: activate)')
        createWindow()
    }
})

// Emitted when a new webContents is created.
// Try to set some values while creating new webviews. See: https://electronjs.org/docs/tutorial/security
app.on('web-contents-created', (event, contents) => {
    contents.on('will-attach-webview', (event, webPreferences, params) => {
        writeLog('info', 'app will attach new webview with target url set to: _' + params.src + '_.')

        // Strip away preload scripts if unused or verify their location is legitimate
        //
        // delete webPreferences.preload
        // delete webPreferences.preloadURL

        // Disable Node.js integration
        webPreferences.nodeIntegration = false

    // Verify URL being loaded
    //
    // if (!params.src.startsWith('https://example.com/'))
    // {
        // event.preventDefault()
    // }
    })
})

// Emitted when a new browserWindow is created.
app.on('browser-window-created', function () {
    writeLog('info', 'app created a browser window (event: browser-window-created)')
})

// Emitted when the application has finished basic startup.
app.on('will-finish-launching', function () {
    writeLog('info', 'app will finish launching (event: will-finish-launching)')
})

// Emitted when the renderer process of webContents crashes or is killed.
app.on('renderer-process-crashed', function () {
    writeLog('error', 'app is realizing a crashed renderer process (event: renderer-process-crashed)')
})

// Emitted when the GPU process crashes or is killed.
app.on('gpu-process-crashed', function () {
    writeLog('error', 'app is realizing a crashed gpu process (event: gpu-process-crashed)')
})

// Emitted whenever there is a GPU info update.
app.on('gpu-info-update', function () {
    writeLog('info', 'app is realizing a GPU info update (event: gpu-info-update)')
})

// Emitted when failed to verify the certificate for url, to trust the certificate you should prevent the default behavior
// with event.preventDefault() and call callback(true).
app.on('certificate-error', function () {
    writeLog('warn', 'app failed to verify the cert (event: certificate-error)')
})

process.on('uncaughtException', (err, origin) => {
    fs.writeSync(
        process.stderr.fd,
        `Caught exception: ${err}\n` +
        `Exception origin: ${origin}`
    )

    writeLog('error', 'UncaughtException - got error: _' + err + '_ with origin: _' + origin + '_.')
})
