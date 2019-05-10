var entries = [];
var panel;
var endOrder = 0;
var startOrder = 0;

function redrawEntries(){
	if(panel) {
		panel.redrawEntries(entries);
	}
}

function onPendingRequest(entry){
    entries.push(entry);
    if(panel) {
		panel.onPendingEntry(entry);
	}
}

function onFinishedRequest(oldEntry, diff){
    Object.assign(oldEntry, diff)
    if(panel) {
		panel.onFinishedEntry(oldEntry);
	}
}

function removeEntry(entry){
    var entryIndex = entries.indexOf(entry);
    if(entryIndex != -1){
        entries.splice(entryIndex, 1);
    }
    if(panel) {
       panel.onRemovedEntry(entry);
    }
}

function onWrongContent (entry, content, data, contentLengthHeader, err) {
    var message = "Cannot read Pbf from Base64 string ("+
                     "content = " + content + ", "
                     "array = " + data + ", size = " + data.length + 
                     (contentLengthHeader != -1 ? ", expectedSize = " + contentLengthHeader : "")+ 
                   ") for tile {z: " + entry.z + ", x: "+ entry.x + ", y: "+ entry.y + "}. " + 
                   "Probably the request was aborted while reading of response body.";
    console.warn(message+ (err ? " Details: " + err.stack : ""));
    chrome.devtools.inspectedWindow.eval("console.warn('" + message + "')");
}

function isTileEmpty(tile){
    for (var layerName in tile.layers){
       var layer = tile.layers[layerName];
       if(layer.length){
          return false
       }
    }
    return true;
}


function combineHeaders(headers/*[{name, value}]*/){
   return headers 
    ? headers.reduce((collector, nameValue)=>{
          return collector[nameValue.name] = nameValue.value, collector;
      }, {})
    : {};
}

let trackEmptyResponse, trackOnlySuccessfulResponse, mvtRequestPatternRegExp

chrome.storage.local.onChanged.addListener(function(changes){
    if(changes['trackEmptyResponse']){
        trackEmptyResponse = !!changes['trackEmptyResponse'].newValue;
    }
    if(changes['trackOnlySuccessfulResponse']){
        trackOnlySuccessfulResponse = !!changes['trackOnlySuccessfulResponse'].newValue;
    }
    if(changes['mvtRequestPattern']){
        let mvtRequestPattern = changes['mvtRequestPattern'].newValue;   
        try{
           mvtRequestPatternRegExp = new RegExp(mvtRequestPattern, "i");    
        } catch(e) {
           console.log("Mvt Request Pattern is invalid", mvtRequestPattern); 
        }
    }
});

chrome.storage.local.get(['trackEmptyResponse', 'trackOnlySuccessfulResponse', 'mvtRequestPattern'], function(r) {
    trackEmptyResponse = r.trackEmptyResponse;
    trackOnlySuccessfulResponse = r.trackOnlySuccessfulResponse;
    try{
       mvtRequestPatternRegExp = new RegExp(r.mvtRequestPattern, "i");    
    } catch(e) {
       console.log("Mvt Request Pattern is invalid", r.mvtRequestPattern); 
    }
   
   chrome.devtools.panels.create("Mapbox Vector Tiles", "images/16.png", "mvt-tiles-panel.html", function(p) {  
      p.onShown.addListener((w)=>{
   	     panel = w; 
   	     panel.onClear = (e) => {
   		   entries = [];
		   endOrder = 0;
		   startOrder = 0;
   		   redrawEntries();
   	     };
   	     redrawEntries();
      });
   
      p.onHidden.addListener((w)=>{
   	     panel = undefined; 
      });
   });

   chrome.devtools.network.onRequestFinished.addListener(
		function(httpEntry) {
		  var urlParseResult = httpEntry.request.url.match(mvtRequestPatternRegExp);
		  
		  if(!urlParseResult)
		  {
		     return;
		  }
    
		  var z = urlParseResult.groups && urlParseResult.groups.z || urlParseResult[1];
		  var x = urlParseResult.groups && urlParseResult.groups.x || urlParseResult[2];
		  var y = urlParseResult.groups && urlParseResult.groups.y || urlParseResult[3];
		  
		  if(!z || !x || !y)
		  {
		     return;
		  }		
		  
		  let nStarted = ++startOrder;
		 
          //http://qnimate.com/detecting-end-of-scrolling-in-html-element/         
          //https://stackoverflow.com/questions/8773921/how-to-automatically-scroll-down-a-html-page
	      var time = httpEntry.time;
	      var startedDateTime = httpEntry.startedDateTime;
          var url = httpEntry.request.url;
          var requestHeaders = combineHeaders(httpEntry.request.headers); 
          
          const pendingEntry = {
            x: x, 
            y: y, 
            z: z, 
            status: -1,
            url: url, 
            headers: requestHeaders, 
            startOrder: nStarted,
            startedDateTime: startedDateTime, 
            statistics: undefined,
            tile: undefined,
            time: undefined,
            endOrder: undefined,
            extra: {isPending: true, isValid: false, isEmpty: false}
          };
		  onPendingRequest(pendingEntry); 
		  
		  httpEntry.getContent(function(content, encoding){
            var responseHeaders = combineHeaders(httpEntry.response.headers);  
            const pendingEntryIndex = entries.indexOf(pendingEntry);
            if(pendingEntryIndex == -1) {
                return;
		    }
            
            var isOk = httpEntry.response.status == 200;
            var isNoContent = httpEntry.response.status == 204;
            var isValid = isOk || isNoContent;

            var layersStatistics = {};
            var statistics = {layersCount: 0, featuresCount: 0, byLayers: layersStatistics /* featuresCount */ };
            var extra = {isPending: false, isValid: isValid, isEmpty: isNoContent};
            var tile;            
            
            function requestFinished() {
                onFinishedRequest(pendingEntry, {...pendingEntry,
                    statistics: statistics,
                    status: httpEntry.response.status, 
                    tile: content,
                    tileSize: extra.isValid && data && data.length,
                    endOrder: ++endOrder,
                    time: httpEntry.time,
                    extra: extra
                })
            }
            
            function emptyRequestFinished() {
                extra.isEmpty = true 
                if(!trackEmptyResponse){
                   removeEntry(pendingEntry);
                } 
                requestFinished(); 
            }

            function notSuccessfulRequestFinished() {
                extra.isValid = false;  
                if(trackOnlySuccessfulResponse){
                  removeEntry(pendingEntry);
                  return;  
                }
                requestFinished(); 
                return;               
            }
                        
            if(!extra.isValid) {
                notSuccessfulRequestFinished();
                return;
            }
                        
			if(extra.isEmpty) {	
               emptyRequestFinished();
		  	   return;
		    }	

            var contentLengthHeader = Number(responseHeaders["content-length"] || responseHeaders["Content-Length"] || -1);
            var data = Uint8Array.from(atob(content), c => c.charCodeAt(0)) ;
            
            /*Content-Length is not equal to actual bytes count*/
            if(content == undefined || (contentLengthHeader != -1 && data.length != contentLengthHeader)){
                onWrongContent(pendingEntry, content, data, contentLengthHeader);
                notSuccessfulRequestFinished();
                return;
            }
            
            if(!data.length){
                emptyRequestFinished();
		  	    return;
            }  

            try{
              tile = new VectorTile.VectorTile(new Pbf(data));    
            } catch (err) {
              onWrongContent(pendingEntry, content, data, contentLengthHeader, err);  
              notSuccessfulRequestFinished();
              return;
            }            
  
            if(isTileEmpty(tile)){
              emptyRequestFinished();
		  	  return;                  
            }
            
            var layersNames = Object.keys(tile.layers);
            layersNames.forEach((layerName)=>{
              var layer = tile.layers[layerName];
              var layerStatistics = statistics.byLayers[layerName] = {};
              layerStatistics.featuresCount = layer.length;
              statistics.featuresCount += layer.length;
            });
            statistics.layersCount = layersNames.length;
            requestFinished();
		  })    
	});
});
