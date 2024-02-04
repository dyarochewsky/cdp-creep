// Copyright Daniel Fonseca Yarochewsky

const { writeFileSync } = require('fs');
const puppeteer = require('puppeteer');
const CDP = require('chrome-remote-interface');

async function getData(browser, fp, iter) {
    try {
        // create browser connection via WS (local)
        let client = await CDP({
            target: browser.wsEndpoint(),
            local: true,
        })

        const {
            Target,
            Debugger
        } = client;

        const {
            targetId
        } = await Target.createTarget({
            url: 'about:blank',
        });
        const {
            sessionId
        } = await Target.attachToTarget({
            targetId: targetId,
            flatten: true
        });
        Target.setDiscoverTargets({
            discover: true
        });

        Target.targetCreated(async (p) => {
            await Target.setAutoAttach({
                autoAttach: true,
                flatten: true,
                waitForDebuggerOnStart: true
            }, sessionId);
        })

        // run script on target int
        Target.attachedToTarget(async (params) => {
            await Runtime.evaluate({
                awaitPromise: true,
                expression: `(() => {
                    try {
                        const spoofProperty = (target, property, val) => {
                            try {
                                Object.defineProperty(target, property, {
                                    enumerable: false,
                                    configurable: false,
                                    value: val,
                                    writable: false,
                                });
                            } catch (error) {}
                        };

                        spoofProperty(window.navigator, 'webdriver', false)

                        window.chrome = {
                            loadTimes() {
                                return {};
                            },
                            csi: {},
                            app: {},
                        };
                        window.chrome.loadTimes.toString = function () {
                            return 'function () { [native code] }';
                        };
            
                        spoofProperty(navigator, 'userAgent',${fp.userAgent});
                        spoofProperty(navigator, 'appVersion', ${fp.appVersion})
                        spoofProperty(navigator, 'hardwareConcurrency', 8)
                        spoofProperty(navigator, 'platform', 'MacIntel')
                        spoofProperty(navigator, 'userAgentData', {
                            brands: [{
                                    brand: "Not=A?Brand",
                                    version: "99",
                                },
                                {
                                    brand: "Chromium",
                                    version: ${fp.agentVersion},
                                },
                            ]
                        });
            
                    } catch {}
            
                })()
            `
            }, params.sessionId)

            await Runtime.runIfWaitingForDebugger(params.sessionId)
        })

        const {
            ServiceWorker,
            Emulation,
            Fetch,
            IndexedDB,
            DOMStorage,
            Page,
            Runtime,
            DOM,
            Network,
            Storage
        } = client;


        // activate protocol APIs
        await Promise.all([
            Fetch.enable({patterns: [{ requestStage: "Response" }]}, sessionId), ServiceWorker.enable(sessionId), IndexedDB.enable(sessionId), DOMStorage.enable(sessionId), Page.enable(sessionId), Runtime.enable(sessionId), DOM.enable(sessionId), Network.enable(sessionId)
        ]);

        Debugger.paused(() => {
            Debugger.resume(sessionId)
        })

        // intercept response to get the data we want in a nice format, instead of dealing with DOM
        Fetch.requestPaused(async p => {
            if (p.request.url === 'https://creepjs-api.web.app/fp' && p.responseStatusCode) {
                const {body, base64Encoded} = await Fetch.getResponseBody({
                    requestId: p.requestId,
                }, sessionId);

                if (base64Encoded) {
                    try {
                        const j = JSON.parse(atob(body));
                        console.log("[+] writing data json");

                        writeFileSync(`out/data_${iter}.json`, JSON.stringify({
                            "trust_score": j.score,
                            "has_lied": j.hasLied,
                            "bot": j.bot,
                            "fingerprint": j.fingerprint,
                        }))
                    } catch {}
                }  
            }
        
            
            Fetch.continueRequest({
                requestId: p.requestId,
            }, sessionId)
        })

        // oof! navigate to the target
        await Page.navigate({
            url: 'https://abrahamjuliot.github.io/creepjs/'
        }, sessionId);


        await Page.loadEventFired(sessionId);
        await Runtime.evaluate({
            expression: 'document.readyState'
        }, sessionId);

        // wait for everything to settle
        await new Promise(resolve => setTimeout(resolve, 10000))

        const { data } = await Page.printToPDF({}, sessionId);

        console.log("[+] writing data pdf")
        writeFileSync(`out/page_${iter}.pdf`, data, 'base64')
    } catch {}
}

(async () => {
    const browser = await puppeteer.launch({
        headless: 'new',
        devtools: false,
    });

    // a few sample spoofing profiles here.
    const profiles = [
        {
            userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 11_0_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4298.0 Safari/537.36",
            appVersion:   "5.0 (Macintosh; Intel Mac OS X 11_0_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4298.0 Safari/537.36",
            agentVersion: "88"
        },
        {
            userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 11_0_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4298.0 Safari/537.36",
            appVersion:   "5.0 (Macintosh; Intel Mac OS X 11_0_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4298.0 Safari/537.36",
            agentVersion: "89"
        },
        {
            userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 11_0_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4298.0 Safari/537.36",
            appVersion:   "5.0 (Macintosh; Intel Mac OS X 11_0_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4298.0 Safari/537.36",
            agentVersion: "91"
        }
    ]
    for (let i = 0; i < 3; i++) {
        await getData(browser, profiles[i], i)
    }

    console.log('[+] all done!')
    process.exit(0)
})()