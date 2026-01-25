/**
 * @name AutoQuestComplete
 * @author VoidDeficit
 * @authorId 392069116430647296
 * @version 1.0.0
 * @description Automatically completes Discord quests
 * @donate https://www.paypal.me/MircoWittrien
 * @patreon https://www.patreon.com/MircoWittrien
 * @website https://mwittrien.github.io/
 * @source https://github.com/VoidDeficit/BetterDiscordAddons/tree/AutoQuestCompleter/Plugins/AutoQuestCompleter
 * @updateUrl https://raw.githubusercontent.com/VoidDeficit/BetterDiscordAddons/refs/heads/AutoQuestCompleter/Plugins/AutoQuestCompleter/AutoQuestCompleter.plugin.js
 */

module.exports = meta => ({
    intervalIds: [],
    observer: null,
    processingQuest: false,
    currentJob: null,

    start() {
        console.log("AutoQuestCompleter Plugin startet!");

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
            
            if(!this.ApplicationStreamingStore) {
                // Alternative exports pattern
                this.ApplicationStreamingStore = Object.values(wpRequire.c).find(x => x?.exports?.A?.__proto__?.getStreamerActiveStreamMetadata)?.exports?.A;
                this.RunningGameStore = Object.values(wpRequire.c).find(x => x?.exports?.Ay?.getRunningGames)?.exports?.Ay;
                this.QuestsStore = Object.values(wpRequire.c).find(x => x?.exports?.A?.__proto__?.getQuest)?.exports?.A;
                this.ChannelStore = Object.values(wpRequire.c).find(x => x?.exports?.A?.__proto__?.getAllThreadsForParent)?.exports?.A;
                this.GuildChannelStore = Object.values(wpRequire.c).find(x => x?.exports?.Ay?.getSFWDefaultChannel)?.exports?.Ay;
                this.FluxDispatcher = Object.values(wpRequire.c).find(x => x?.exports?.h?.__proto__?.flushWaitQueue)?.exports?.h;
                this.api = Object.values(wpRequire.c).find(x => x?.exports?.Bo?.get)?.exports?.Bo;
            } else {
                // Original exports pattern
                this.RunningGameStore = Object.values(wpRequire.c).find(x => x?.exports?.ZP?.getRunningGames)?.exports?.ZP;
                this.QuestsStore = Object.values(wpRequire.c).find(x => x?.exports?.Z?.__proto__?.getQuest)?.exports?.Z;
                this.ChannelStore = Object.values(wpRequire.c).find(x => x?.exports?.Z?.__proto__?.getAllThreadsForParent)?.exports?.Z;
                this.GuildChannelStore = Object.values(wpRequire.c).find(x => x?.exports?.ZP?.getSFWDefaultChannel)?.exports?.ZP;
                this.FluxDispatcher = Object.values(wpRequire.c).find(x => x?.exports?.Z?.__proto__?.flushWaitQueue)?.exports?.Z;
                this.api = Object.values(wpRequire.c).find(x => x?.exports?.tn?.get)?.exports?.tn;
            }

            console.log("Stores loaded:", { 
                ApplicationStreamingStore: this.ApplicationStreamingStore, 
                RunningGameStore: this.RunningGameStore,
                QuestsStore: this.QuestsStore,
                ChannelStore: this.ChannelStore,
                GuildChannelStore: this.GuildChannelStore,
                FluxDispatcher: this.FluxDispatcher,
                api: this.api
            });

            // Start quest processing
            this.startQuestProcessing();

        } catch(e) { 
            console.error("Error loading wpRequire:", e); 
            return; 
        }
    },

    stop() {
        console.log("AutoQuestCompleter Plugin gestoppt!");
        // Alle Intervalle löschen
        this.intervalIds.forEach(id => clearInterval(id));
        this.intervalIds = [];
        // Observer trennen
        if(this.observer) this.observer.disconnect();
        this.processingQuest = false;
        this.currentJob = null;
    },

    startQuestProcessing() {
        const supportedTasks = ["WATCH_VIDEO", "PLAY_ON_DESKTOP", "STREAM_ON_DESKTOP", "PLAY_ACTIVITY", "WATCH_VIDEO_ON_MOBILE"];
        
        // Check for quests periodically
        this.intervalIds.push(setInterval(() => {
            if(this.processingQuest || !this.QuestsStore || !this.api) return;
            
            const quests = [...this.QuestsStore.quests.values()].filter(x => 
                x.id !== "1412491570820812933" &&
                x.userStatus?.enrolledAt && 
                !x.userStatus?.completedAt && 
                new Date(x.config.expiresAt).getTime() > Date.now() &&
                supportedTasks.find(y => Object.keys((x.config.taskConfig ?? x.config.taskConfigV2).tasks).includes(y))
            );
            
            if(quests.length === 0) {
                console.log("Keine unvollendeten Quests verfügbar.");
                return;
            }
            
            console.log(`Found ${quests.length} quest(s) to complete`);
            this.processQuestQueue(quests);
        }, 10000));
    },

    async processQuestQueue(quests) {
        if(this.processingQuest) return;
        
        const doJob = async () => {
            const quest = quests.pop();
            if(!quest) {
                this.processingQuest = false;
                this.currentJob = null;
                return;
            }
            
            this.processingQuest = true;
            this.currentJob = quest;
            
            const pid = Math.floor(Math.random() * 30000) + 1000;
            const applicationId = quest.config.application?.id;
            const applicationName = quest.config.application?.name;
            const questName = quest.config.messages?.questName;
            const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
            const taskName = ["WATCH_VIDEO", "PLAY_ON_DESKTOP", "STREAM_ON_DESKTOP", "PLAY_ACTIVITY", "WATCH_VIDEO_ON_MOBILE"]
                .find(x => taskConfig.tasks[x] != null);
            const secondsNeeded = taskConfig.tasks[taskName].target;
            let secondsDone = quest.userStatus?.progress?.[taskName]?.value ?? 0;
            const enrolledAt = new Date(quest.userStatus.enrolledAt).getTime();
            const isApp = typeof DiscordNative !== "undefined";

            console.log(`Bearbeite Quest: ${questName} (${taskName})`);

            // --- VIDEO ---
            if(taskName === "WATCH_VIDEO" || taskName === "WATCH_VIDEO_ON_MOBILE") {
                console.log("Video Quest erkannt. Spoofing startet.");
                const maxFuture = 10;
                const speed = 7;
                const interval = 1;
                let completed = false;

                const videoFn = async () => {
                    while(true) {
                        const maxAllowed = Math.floor((Date.now() - enrolledAt)/1000) + maxFuture;
                        const diff = maxAllowed - secondsDone;
                        const timestamp = secondsDone + speed;
                        
                        if(diff >= speed) {
                            const res = await this.api.post({url: `/quests/${quest.id}/video-progress`, body: {timestamp: Math.min(secondsNeeded, timestamp + Math.random())}});
                            completed = res.body.completed_at != null;
                            secondsDone = Math.min(secondsNeeded, timestamp);
                            console.log(`Video progress: ${secondsDone}/${secondsNeeded}`);
                        }
                        
                        if(timestamp >= secondsNeeded) {
                            break;
                        }
                        await new Promise(resolve => setTimeout(resolve, interval * 1000));
                    }
                    
                    if(!completed) {
                        await this.api.post({url: `/quests/${quest.id}/video-progress`, body: {timestamp: secondsNeeded}});
                    }
                    console.log("Video Quest abgeschlossen!");
                    doJob();
                };
                videoFn();
            }

            // --- PLAY_ON_DESKTOP ---
            else if(taskName === "PLAY_ON_DESKTOP") {
                if(!isApp) {
                    console.log("This no longer works in browser for non-video quests. Use the discord desktop app to complete the", questName, "quest!");
                    doJob();
                    return;
                }
                
                console.log("Desktop Quest erkannt. Spoofing startet.");

                try {
                    const res = await this.api.get({url: `/applications/public?application_ids=${applicationId}`});
                    const appData = res.body[0];
                    const exeName = appData.executables.find(x => x.os === "win32").name.replace(">","");
                    
                    const fakeGame = {
                        cmdLine: `C:\\Program Files\\${appData.name}\\${exeName}`,
                        exeName,
                        exePath: `c:/program files/${appData.name.toLowerCase()}/${exeName}`,
                        hidden: false,
                        isLauncher: false,
                        id: applicationId,
                        name: appData.name,
                        pid: pid,
                        pidPath: [pid],
                        processName: appData.name,
                        start: Date.now(),
                    };
                    
                    const realGames = this.RunningGameStore.getRunningGames();
                    const fakeGames = [fakeGame];
                    const realGetRunningGames = this.RunningGameStore.getRunningGames;
                    const realGetGameForPID = this.RunningGameStore.getGameForPID;
                    
                    this.RunningGameStore.getRunningGames = () => fakeGames;
                    this.RunningGameStore.getGameForPID = (pid) => fakeGames.find(x => x.pid === pid);
                    this.FluxDispatcher.dispatch({type: "RUNNING_GAMES_CHANGE", removed: realGames, added: [fakeGame], games: fakeGames});

                    const listener = data => {
                        const progress = quest.config.configVersion === 1 ? 
                            data.userStatus.streamProgressSeconds : 
                            Math.floor(data.userStatus.progress.PLAY_ON_DESKTOP.value);
                        console.log(`Desktop progress: ${progress}/${secondsNeeded}`);
                        
                        if(progress >= secondsNeeded) {
                            console.log("Desktop Quest abgeschlossen!");
                            this.RunningGameStore.getRunningGames = realGetRunningGames;
                            this.RunningGameStore.getGameForPID = realGetGameForPID;
                            this.FluxDispatcher.dispatch({type: "RUNNING_GAMES_CHANGE", removed: [fakeGame], added: [], games: []});
                            this.FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", listener);
                            doJob();
                        }
                    };
                    this.FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", listener);
                    
                    console.log(`Spoofed your game to ${applicationName}. Wait for ${Math.ceil((secondsNeeded - secondsDone) / 60)} more minutes.`);
                } catch(e) { 
                    console.error("Error PLAY_ON_DESKTOP:", e); 
                    doJob();
                }
            }

            // --- STREAM_ON_DESKTOP ---
            else if(taskName === "STREAM_ON_DESKTOP") {
                if(!isApp) {
                    console.log("This no longer works in browser for non-video quests. Use the discord desktop app to complete the", questName, "quest!");
                    doJob();
                    return;
                }
                
                console.log("Stream Quest erkannt. Spoofing startet.");
                
                const realFunc = this.ApplicationStreamingStore.getStreamerActiveStreamMetadata;
                this.ApplicationStreamingStore.getStreamerActiveStreamMetadata = () => ({
                    id: applicationId,
                    pid,
                    sourceName: null
                });
                
                const listener = data => {
                    const progress = quest.config.configVersion === 1 ? 
                        data.userStatus.streamProgressSeconds : 
                        Math.floor(data.userStatus.progress.STREAM_ON_DESKTOP.value);
                    console.log(`Stream progress: ${progress}/${secondsNeeded}`);
                    
                    if(progress >= secondsNeeded) {
                        console.log("Stream Quest abgeschlossen!");
                        this.ApplicationStreamingStore.getStreamerActiveStreamMetadata = realFunc;
                        this.FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", listener);
                        doJob();
                    }
                };
                this.FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", listener);
                
                console.log(`Spoofed your stream to ${applicationName}. Stream any window in vc for ${Math.ceil((secondsNeeded - secondsDone) / 60)} more minutes.`);
                console.log("Remember that you need at least 1 other person to be in the vc!");
            }

            // --- PLAY_ACTIVITY ---
            else if(taskName === "PLAY_ACTIVITY") {
                console.log("Activity Quest erkannt. Bearbeitung startet.");
                
                // Find a channel for the activity
                const channelId = this.ChannelStore.getSortedPrivateChannels()[0]?.id ?? 
                    Object.values(this.GuildChannelStore.getAllGuilds()).find(x => 
                        x != null && x.VOCAL.length > 0
                    )?.VOCAL[0]?.channel?.id;
                
                if(!channelId) {
                    console.error("No channel found for PLAY_ACTIVITY quest!");
                    doJob();
                    return;
                }
                
                const streamKey = `call:${channelId}:1`;
                
                const activityFn = async () => {
                    console.log(`Completing quest ${questName} - ${quest.config.messages.questName}`);
                    
                    while(true) {
                        const res = await this.api.post({url: `/quests/${quest.id}/heartbeat`, body: {stream_key: streamKey, terminal: false}});
                        const progress = res.body.progress.PLAY_ACTIVITY.value;
                        console.log(`Activity progress: ${progress}/${secondsNeeded}`);
                        
                        await new Promise(resolve => setTimeout(resolve, 20 * 1000));
                        
                        if(progress >= secondsNeeded) {
                            await this.api.post({url: `/quests/${quest.id}/heartbeat`, body: {stream_key: streamKey, terminal: true}});
                            break;
                        }
                    }
                    
                    console.log("Activity Quest abgeschlossen!");
                    doJob();
                };
                activityFn();
            } else {
                console.log(`Unsupported task type: ${taskName}`);
                doJob();
            }
        };
        
        doJob();
    }
});