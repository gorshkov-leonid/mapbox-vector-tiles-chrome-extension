chrome.runtime.onInstalled.addListener(function () {
    chrome.storage.local.set({
            mvtRequestPattern: ".*\\/(?<z>\\d+)\\/(?<x>\\d+)\\/(?<y>\\d+)\\.mvt[^\\/]*$",
            trackEmptyResponse: true,
            trackOnlySuccessfulResponse: false
        },
        function () {
        }
    );

    chrome.declarativeContent.onPageChanged.removeRules(undefined, function () {
        chrome.declarativeContent.onPageChanged.addRules([{
            conditions: [new chrome.declarativeContent.PageStateMatcher({
                pageUrl: {},
            })
            ],
            actions: [new chrome.declarativeContent.ShowPageAction()]
        }]);
    });
});