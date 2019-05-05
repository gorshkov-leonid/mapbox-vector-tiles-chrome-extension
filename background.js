chrome.runtime.onInstalled.addListener(function() {
  chrome.storage.local.set({
		mvtRequestPattern: ".*\\/(?<z>\\d+)\\/(?<x>\\d+)\\/(?<y>\\d+)\\.mvt[^\\/]*$",
		trackEmptyResponse: true,
		trackOnlySuccessfulResponse: false
    }, 
    function() {}
  )
  
  chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
     chrome.declarativeContent.onPageChanged.addRules([{
	   conditions: [new chrome.declarativeContent.PageStateMatcher({
	     pageUrl: {},
	   })
	   ],
	   actions: [new chrome.declarativeContent.ShowPageAction()]
     }]);
  });
  
  chrome.runtime.onConnect.addListener(function(devToolsConnection) {
    var devToolsListener = function(event, sender, sendResponse) {
        if(event.type == "injectScript") {
            chrome.tabs.executeScript(event.tabId, { file: event.scriptToInject });
        }
        else if(event.type == "downloadFile"){
            chrome.tabs.executeScript(event.tabId, { code: 'downloadFile(' + JSON.stringify(event.requestParams) + ')' });
        }
    }
    devToolsConnection.onMessage.addListener(devToolsListener);
    devToolsConnection.onDisconnect.addListener(function() {
         devToolsConnection.onMessage.removeListener(devToolsListener);
    });
  });  
});