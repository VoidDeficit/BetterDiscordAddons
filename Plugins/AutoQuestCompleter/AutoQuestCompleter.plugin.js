/**
 * @name AutoQuestComplete
 * @author VoidDeficit
 * @version 1.0.0
 * @description Automatically completes Discord quests
 */

module.exports = meta => ({
    intervalIds: [],
    observer: null,
    processingQuest: false,

    start() {
        console.log("AutoQuestSafe Plugin gestartet!");

        // --- Video Handling ---
        const VIDEO_SPEED = 16;
        const scanVideos = () => {
            document.querySelectorAll("video").forEach(v => {
                if (!v.dataset.speedupApplied && v.src && v.src.startsWith("blob:")) {
                    v.dataset.speedupApplied = "true";
                    v.playbackRate = VIDEO_SPEED;
                    console.log("Video sped up to", VIDEO_SPEED, "x:", v.src);
                }
            });
        };

        // Observer für neue Videos
        this.observer = new MutationObserver(scanVideos);
        this.observer.observe(document.body, { childList: true, subtree: true });
        this.intervalIds.push(setInterval(scanVideos, 5000));

        // --- Discord Stores ---
        try {
            delete window.$;
            const wpRequire = webpackChunkdiscord_app.push([[Symbol()], {}, r => r]);
            webpackChunkdiscord_app.pop();

            this.ApplicationStreamingStore = Object.values(wpRequire.c).find(x => x?.exports?.Z?.__proto__?.getStreamerActiveStreamMetadata)?.exports?.Z;
            this.RunningGameStore = Object.values(wpRequire.c).find(x => x?.exports?.ZP?.getRunningGames)?.exports?.ZP;
            this.QuestsStore = Object.values(wpRequire.c).find(x => x?.exports?.Z?.__proto__?.getQuest)?.exports?.Z;
            this.ChannelStore = Object.values(wpRequire.c).find(x => x?.exports?.Z?.__proto__?.getAllThreadsForParent)?.exports?.Z;
            this.GuildChannelStore = Object.values(wpRequire.c).find(x => x?.exports?.ZP?.getSFWDefaultChannel)?.exports?.ZP;
            this.FluxDispatcher = Object.values(wpRequire.c).find(x => x?.exports?.Z?.__proto__?.flushWaitQueue)?.exports?.Z;
            this.api = Object.values(wpRequire.c).find(x => x?.exports?.tn?.get)?.exports?.tn;

            console.log("Stores loaded:", { 
                ApplicationStreamingStore: this.ApplicationStreamingStore, 
                RunningGameStore: this.RunningGameStore,
                QuestsStore: this.QuestsStore,
                ChannelStore: this.ChannelStore,
                GuildChannelStore: this.GuildChannelStore,
                FluxDispatcher: this.FluxDispatcher,
                api: this.api
            });

        } catch(e) { console.error("Error loading wpRequire:", e); return; }

        // --- Hauptloop ---
        this.intervalIds.push(setInterval(() => this.handleQuest(), 10000));
    },

    stop() {
        console.log("AutoQuestSafe Plugin gestoppt!");
        // Alle Intervalle löschen
        this.intervalIds.forEach(id => clearInterval(id));
        this.intervalIds = [];
        // Observer trennen
        if(this.observer) this.observer.disconnect();
        this.processingQuest = false;
    },

    async handleQuest() {
        if(this.processingQuest || !this.QuestsStore || !this.api) return;

        const quest = [...this.QuestsStore.quests.values()].find(q =>
            q.id !== "1412491570820812933" &&
            q.userStatus?.enrolledAt &&
            !q.userStatus?.completedAt &&
            new Date(q.config.expiresAt).getTime() > Date.now()
        );

        if(!quest) return console.log("Keine unvollendeten Quests verfügbar.");

        this.processingQuest = true;
        console.log("Bearbeite Quest:", quest.config?.messages?.questName);

        const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
        const taskName = ["WATCH_VIDEO", "PLAY_ON_DESKTOP", "STREAM_ON_DESKTOP", "PLAY_ACTIVITY", "WATCH_VIDEO_ON_MOBILE"]
            .find(x => taskConfig.tasks[x] != null);
        const secondsNeeded = taskConfig.tasks[taskName].target;
        let secondsDone = quest.userStatus?.progress?.[taskName]?.value ?? 0;
        const enrolledAt = new Date(quest.userStatus.enrolledAt).getTime();
        const pid = Math.floor(Math.random() * 30000) + 1000;
        const isApp = typeof DiscordNative !== "undefined";

        // --- VIDEO ---
        if(taskName === "WATCH_VIDEO" || taskName === "WATCH_VIDEO_ON_MOBILE") {
            console.log("Video Quest erkannt. Spoofing gestartet.");
            const intervalSec = 5;
            const speed = 5;
            let completed = false;

            const videoFn = async () => {
                while(secondsDone < secondsNeeded) {
                    const maxAllowed = Math.floor((Date.now() - enrolledAt)/1000);
                    const timestamp = Math.min(secondsDone + speed, secondsNeeded);
                    if(maxAllowed - secondsDone >= speed) {
                        const res = await this.api.post({url: `/quests/${quest.id}/video-progress`, body: {timestamp}});
                        completed = res.body.completed_at != null;
                        secondsDone = timestamp;
                        console.log(`Video progress: ${secondsDone}/${secondsNeeded}`);
                    }
                    if(secondsDone >= secondsNeeded) break;
                    await new Promise(r => setTimeout(r, intervalSec * 1000));
                }
                if(!completed) await this.api.post({url: `/quests/${quest.id}/video-progress`, body: {timestamp: secondsNeeded}});
                console.log("Video Quest abgeschlossen!");
                this.processingQuest = false;
            };
            videoFn();
        }

        // --- PLAY_ON_DESKTOP ---
        else if(taskName === "PLAY_ON_DESKTOP") {
            if(!isApp) {
                console.log("Desktop-App benötigt für PLAY_ON_DESKTOP!");
                this.processingQuest = false;
                return;
            }
            console.log("Desktop Quest erkannt. Spoofing gestartet.");

            try {
                const res = await this.api.get({url: `/applications/public?application_ids=${quest.config.application.id}`});
                const appData = res.body[0];
                const exeName = appData.executables.find(x => x.os === "win32").name.replace(">","");
                const fakeGame = { cmdLine:`C:\\Program Files\\${appData.name}\\${exeName}`, exeName, exePath:`c:/program files/${appData.name.toLowerCase()}/${exeName}`, hidden:false, isLauncher:false, id:quest.config.application.id, name:appData.name, pid, pidPath:[pid], processName:appData.name, start:Date.now() };
                const realGames = this.RunningGameStore.getRunningGames();
                const fakeGames = [fakeGame];
                const realGetRunningGames = this.RunningGameStore.getRunningGames;
                const realGetGameForPID = this.RunningGameStore.getGameForPID;
                this.RunningGameStore.getRunningGames = () => fakeGames;
                this.RunningGameStore.getGameForPID = (pid) => fakeGames.find(x => x.pid === pid);
                this.FluxDispatcher.dispatch({type:"RUNNING_GAMES_CHANGE", removed:realGames, added:[fakeGame], games:fakeGames});

                const listener = data => {
                    const progress = quest.config.configVersion===1 ? data.userStatus.streamProgressSeconds : Math.floor(data.userStatus.progress.PLAY_ON_DESKTOP.value);
                    console.log(`Desktop progress: ${progress}/${secondsNeeded}`);
                    if(progress >= secondsNeeded) {
                        console.log("Desktop Quest abgeschlossen!");
                        this.RunningGameStore.getRunningGames = realGetRunningGames;
                        this.RunningGameStore.getGameForPID = realGetGameForPID;
                        this.FluxDispatcher.dispatch({type:"RUNNING_GAMES_CHANGE", removed:[fakeGame], added:[], games:[]});
                        this.FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", listener);
                        this.processingQuest = false;
                    }
                };
                this.FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", listener);
            } catch(e) { console.error("Error PLAY_ON_DESKTOP:", e); this.processingQuest = false; }
        }

        // Andere Questtypen können nach dem gleichen Prinzip sicher ergänzt werden
    }
});
