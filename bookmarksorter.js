// Smartsort.is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// Smartsort.is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with Smartsort. If not, see <http://www.gnu.org/licenses/>.

/*

Can I change the callback's arguments, and store variables in the arguments...

ToDo: 
BUG: 
1- autosort and extension must persist in the background. ***Keep Bookmarks library, make NEW FILE for background page that runs a script depending on the given params.***
2- extension must start up when the browser is opened (controllable with flag?)
3- autosort flags must be in local storage
4- manual sort AND auto sort should delete empty folders
5- change OnVisited to move the bookmark OUT OF ITS ROOT FOLDER and to OTHER BOOKMARKS ---or--- increment it if it is already there



***Bookmark Create can fail if the quota is reached
callback.call(***THIS***, args) http://www.datejs.com/
Returning inside a callback will pass it up and return out of the original function
onCreate should move the folder up.
Duplicates should be found and combined.
Empty folders should be deleted
Accessing variables outside of a callback (asynchronous function) is bad...use a closure
Alchemy requests may fail on URLs that are firewalled (proprietary) - do we fall back on the website title given by chrome?
*/


SmartBookmarks = {
	config : {
		requestCategoryURL : "http://access.alchemyapi.com/calls/url/URLGetCategory",
		requestTitleURL : "http://access.alchemyapi.com/calls/url/URLGetTitle",
		requestTopicURL : "http://access.alchemyapi.com/calls/url/URLGetRankedConcepts",
		apiStorageKey : "bookmarksort_apikey",
		oldBookmarkDaysKey : "bookmarksort_oldarchive",
		autoSortActiveKey : "bookmarksort_auto_on",
		outputMode : "json",
		autoSortMinutes : 1,
		indexCounter : "bookmarkIndexCounter",
		oldBookmarkDaysDefault : 30,
		bookmarkAlarm : "bookmarkAlarm",
		rootBookmarksKey : 0,
		otherBookmarksKey : 1,
		sampleNumber : 3,
		autoSortCreateKey : "bookmarkauto_oncreate",
		autoSortTimedKey : "bookmarkauto_timed",
		autoSortPriorityKey : "bookmarkauto_priority"
	},
}

/******* BOOKMARK SORTER *******/

function attachCreateSort() {
	/* When a bookmark is created, it will be moved to an appropriate Title folder." */
	chromeBookmarkOnCreated(onCreatedListener);
}

function attachIntervalSort() {
	/* On a timed interval, older bookmarks will be archived to a Category folder and loose bookmarks will be sorted. */
	chromeDeployAlarm(SmartBookmarks.config.bookmarkAlarm, intervalAlarm, SmartBookmarks.config.autoSortMinutes); 
}

function attachVisitSort() {
	/*When visiting a URL, a matching bookmark will be moved up. <TODO?> If it's in an archive, it will be taken out. */
	chromeHistoryOnVisited(onVisitedListener);
}

function detachCreateSort() {
	chromeBookmarksDetachCreated(onCreatedListener);
}

function detachIntervalSort() {
	chromeAlarmsDetach(SmartBookmarks.config.bookmarkAlarm);
}

function detachVisitSort() {
	chromeHistoryDetachVisited(onVisitedListener);
}

function enableAutomaticSort() {
	var isOnCreate = getAutoOnCreate();
	var isOnInterval = getAutoInterval();
	var isPrioritize = getAutoPrioritize();

	if(isOnCreate)
		attachCreateSort();
	if(isOnInterval)
		attachIntervalSort();
	if(isPrioritize)
		attachVisitSort();
}

function disableAutomaticSort() {
	detachCreateSort();
	detachIntervalSort();
	detachVisitSort();
}

function onCreatedListener(id, bookmark)
{
	// Sort the bookmark by title
	sortBookmarkByTitle(id, bookmark, bookmark.url);
}

function onVisitedListener(result)
{
	var url = result.url;
	// Get the base url

	// Check if a matching bookmark exists
	searchBookmarks(url, function(results) {
		var result = results[0];

		// Matching bookmark to url exists
		if(result !==  undefined)
		{
			var id = result.id;	
			var parentId = result.parentId;

			// Move it to the top of other bookmarks
			getOtherBookmarks(function(result) {

				var otherBookmarksId = result.id;
									
				var destination = {
					parentId : otherBookmarksId,
					index : 0
				};
				
				moveBookmark(id, destination, function() {});
			});
		}
		// Otherwise, do nothing.
	});
}

function intervalAlarm(alarm)
{
	// Get the local counter or start it at 0
	var me = this;
	var counterKey = SmartBookmarks.config.indexCounter;
	var counterValue = jQueryStorageGetValue(counterKey) || 0;
	console.log("interval alarm at counter = ", counterValue);
	// Get the bookmark children in Other Bookmarks
	getBookmarkChildren(SmartBookmarks.config.otherBookmarks, function(results) {
		// Get the bookmark at the current index
		var bookmark = results[counterValue];
		
		if(bookmark !== undefined) {

			console.log("Found a bookmark by the name ", bookmark.title);
			
			// Check if the URL hasn't been visited in a while
			var title = bookmark.title;
			var url = bookmark.url;
			var myId = bookmark.id;
			var baseUrl = getBaseUrl(url);

			// Could be a folder
			if(url !== undefined)
			{
				// Get visits for the url
				chromeGetVisits(url, function(results) {
					var oldBookmarkDays = getOldBookmarkDays();
					if(results !== undefined) {
						var visit = results[0];
						if (visit !== undefined)
						{
							var visitTime = visit.visitTime;
							var currentTime = new Date();
							var daysBetween = me.daysBetween(visitTime, currentTime.getTime());
						
							if (daysBetween > oldBookmarkDays) {
								// Sort the bookmark by category
								sortBookmark(bookmark);		
							} 
						} else {
							// No history on this item... sort it anyway.
							console.log("*****ALERT***** NO VISIT RESULTS...?");
							sortBookmark(bookmark);		
						}
					} 
				});
			}
		}
			
		// Otherwise, do nothing.
	
		// Set the counter to the next index, or 0 if it is the tail
		var incCounter = counterValue < results.length ? counterValue + 1 : 0;
		console.log("Setting the counter from ", counterValue, " to ", incCounter );

		jQueryStorageSetValue(counterKey, incCounter);
	});
}

function sortBookmark(bookmark) {
	createFolderByCategory(bookmark.url, undefined, function(result) {
		createFolderByTitle(bookmark.url, result.id, function(result) {
			var destination = {
				index : 0,
				parentId : result.id
			};
			
			// Move the bookmark to that folder
			moveBookmark(bookmark.id, destination, function(result){});
		});
	});
}

function createFolderByTitle(url, parentId, callback) {
	alchemyTitleLookup(url, function(title) {
		createFolder(title, parentId, callback);
	});
}

function alchemyTitleLookup(url, callback) {
		// Check local cache to see if the base URL has associated data.
		var cachedData = jQueryStorageGetValue(url),
			me = this;
		
		// Get the base url
		var baseUrl = getBaseUrl(url);
		
		// If not, make an API request.
		if(cachedData === null || cachedData.title === undefined)
		{
			this.alchemyTitle(baseUrl, function(data, textStatus, jqXHR) {

				var title = data.title;
				
				var category = undefined;
				// Category data may already exist
				if(cachedData != null)
					category = cachedData.category;
				
				// Check result
				if (title !== null && title !== undefined) {		
					// Cache the result in local storage
					me.jQueryStorageSetValue(url, {title: title, category: category});
				}
				
				// Invoke the callback
				callback.call(me, title);
			});
		}
		else 
		{
			// Cached title
			var title = cachedData.title;
			
			// Invoke the callback
			callback.call(me, title);

		}
}

function createFolderByCategory(url, parentId, callback) 
{
	alchemyCategoryLookup(url, function(category) {
		createFolder(category, parentId, callback);
	});
}

function alchemyCategoryLookup(url, callback) 
{
	var cachedData = jQueryStorageGetValue(url),
		me = this;
	
	// Check if there is cached data
	if(cachedData === null || cachedData.title === undefined) {
		// If not, make an API request.
		alchemyCategory(url, function(data, textStatus, jqXHR) {

			var category = data.category;
			var title = undefined;

			// Title data may already exist
			if(cachedData != null)
				title = cachedData.title;
						
			// Check result
			if (category !== null && category !== undefined) {
		
				// Cache the result in local storage
				jQueryStorageSetValue(url, {title: title, category: category});
								
				// Invoke the callback
				callback.call(me, category);
			}
		});
	} else {
		// Cached category
		var category = cachedData.category;
		
		// Invoke the callback
		callback.call(me, category);
	}

}

/*
	Create folder (if it does not exist) with specified parentID with name, callback
*/
function createFolder(title, parentId, callback) {
		var me = this;
		
		searchFolders(function(bookmark) {return bookmark !== undefined && bookmark.title == title && bookmark.url == undefined;}, function(ret) {
			if(ret.length > 0){
				// Folder already exists - invoke the callback with the first result
				callback.call(me, ret[0]);
			}
			else {
				// Create the folder and move to it	
				//console.log("New folder: ", title);
				var folder = {
					title : title,
					parentId : parentId
				};
	
				// Disable the bookmark onCreate listener, because programmatic creation of bookmarks/folders will kick off the event
				me.chromeBookmarksDetachCreated(onCreatedListener);
				// Create the folder
				me.createBookmark(folder, function(result) {
					// Enable the bookmark onCreate listener
					me.chromeBookmarkOnCreated(me.onCreatedListener);
					// Invoke the callback
					callback.call(me, result);
				});
			}
		});
}


/*
Sort a sample of bookmarks
*/
function sortSample()
{
	sortOtherBookmarks(SmartBookmarks.config.sampleNumber);
}

/* 
Manually sort the other bookmarks folder
*/
function sortOtherBookmarks(num)
{
	// Get the ID of other bookmarks folder
	getBookmarkChildren(SmartBookmarks.config.rootBookmarksKey.toString(), function(results) {
		var id = results[SmartBookmarks.config.otherBookmarksKey].id;
		sortBookmarks(id, num);	
	});
}

/*
Manually sorts specified amount of bookmarks. If left undefined, sorts all bookmarks
Be sure to go into subfolders

NOTE: this code is broken..it doesn't count how many bookmarks it has sorted when it recurses into folders.
*/
function sortBookmarks(rootId, num)
{
	var me = this;
	getBookmarkChildren(rootId, function(results) {
		
		var numSorts = num || results.length,
			i = 0;

		// Sort the bookmarks
		for (; i < numSorts; i++) {
			var bookmark = results[i];

			// Closure
			(function(bookmark) {
				if (bookmark !== undefined) {
					var myId = bookmark.id;
					var url = bookmark.url;
					
					// It may be a folder
					if (url !== undefined) {
						var oldBookmarkDays = getOldBookmarkDays();
						
						// Get visits for the url
						chromeGetVisits(url, function(results){
							if(results !== undefined) {
								var visit = results[0];
								if (visit !== undefined)
								{
									var visitTime = visit.visitTime;
									var currentTime = new Date();
									var daysBetween = me.daysBetween(visitTime, currentTime.getTime());
								
									if (daysBetween > oldBookmarkDays) {
										// Sort the bookmark
										sortBookmark(bookmark);
									} else {
										// Move the bookmark to the top
										//
									}
								} else {
									// No history on this item... sort it anyways.
									sortBookmark(bookmark);
								}
							} 
							
						});	
					} else {
						// Recurse into the folder
						sortBookmarks(myId, numSorts);
					}
				}
			})(bookmark)
		}	
	});
}


/*
* Set the API key in local storage
*/
function setApiKey(apikey) 
{
	jQueryStorageSetValue(SmartBookmarks.config.bookmarksort_apikey, apikey);
}

/*
* Get the API key in local storage
*/
function getApiKey()
{
	return jQueryStorageGetValue(SmartBookmarks.config.bookmarksort_apikey);
}

/*
Set auto on create
*/
function setAutoOnCreate(value)
{
	jQueryStorageSetValue(SmartBookmarks.config.autoSortCreateKey, value);
}

/*
* Get the auto onCreate value
*/
function getAutoOnCreate()
{
	return jQueryStorageGetValue(SmartBookmarks.config.autoSortCreateKey);
}

/*
Set auto timed key
*/
function setAutoInterval(value)
{
	jQueryStorageSetValue(SmartBookmarks.config.autoTimedKey, value);
}

/*
* Get the auto interval key
*/
function getAutoInterval()
{
	return jQueryStorageGetValue(SmartBookmarks.config.autoTimedKey);
}

/*
Set auto prioritize
*/
function setAutoPrioritize(value)
{
	jQueryStorageSetValue(SmartBookmarks.config.autoSortPriorityKey, value);
}

/*
* Get the auto prioritize value
*/
function getAutoPrioritize()
{
	return jQueryStorageGetValue(SmartBookmarks.config.autoSortPriorityKey);
}

/*
* Set old bookmark days for determining whether or not to archive
*/
function setOldBookmarkDays(value)
{
	jQueryStorageSetValue(SmartBookmarks.config.oldBookmarkDaysKey, value);
}

/*
* Get old bookmark days for determining whether or not to archive
*/
function getOldBookmarkDays()
{
	return jQueryStorageGetValue(SmartBookmarks.config.oldBookmarkDaysKey) || SmartBookmarks.config.oldBookmarkDaysDefault;
}
/*
Distributes a given number of sort operations over 24 hours in milliseconds
*/
function distributeUnits(operations, time)
{
	return 1000 * 1 / Math.floor(operations / (60 * 60));
}

function getBaseUrl(url)
{
	pathArray = String(url).split( '/' ); 
	host = pathArray[2]; 
	return host;
}

// Courtesy of Michael Liu at http://stackoverflow.com/questions/542938/how-do-i-get-the-number-of-days-between-two-dates-in-jquery
function treatAsUTC(date) {
    var result = new Date(date);
    result.setMinutes(result.getMinutes() - result.getTimezoneOffset());
    return result;
}

function daysBetween(startDate, endDate) {
    var millisecondsPerDay = 24 * 60 * 60 * 1000;
    return (treatAsUTC(endDate) - treatAsUTC(startDate)) / millisecondsPerDay;
}

/******* JQUERY *******/
/*
/*Make a JQuery REST request with the given parameters with the given callback*/
function jqueryREST(requestURL, data, callback, dataType)
{
	jQuery.get(requestURL, data, callback, dataType);
}

/*
/*Make a JQuery local store query
*/
function jQueryStorageGetValue(key)
{
	return $.totalStorage(key);
}

/*
/* Set a local storage value
*/
function jQueryStorageSetValue(key, value)
{
	$.totalStorage(key, value);
}

/******* ALCHEMY API *******/
/*
Make an Alchemy API key test that runs callbackA if the key is valid, and runs callbackB if the key is not valid. Assumes google.com is operational :)
*/
function alchemyKeyTest(apiKey, callbackA, callbackB, argsA, argsB, scope)
{
	//Create a local data object for the API request 
	var url = "http://www.google.com";
	var data = { 
		url : url,
		apikey : apiKey,
		outputMode : this.SmartBookmarks.config.outputMode
	};
	
	var dataType = "json";
	var requestURL = this.SmartBookmarks.config.requestCategoryURL;
	var apiCallback = function(data, textStatus, jqXHR) {
		data.statusInfo === "invalid-api-key" ? callbackB.apply(argsB, scope) : callbackA.apply(argsA, scope);
	};
	//API request for getting the category of a URL
	this.jqueryREST(requestURL, data, apiCallback, dataType);
}

/*
Make an Alchemy API Text Extraction REST request
*/
function alchemyCategory(url, callback)
{
	// Get the api key from local storage
	var apikey = getApiKey();
	
	// Create a local data object for the API request 
	var data = { 
		url : url,
		apikey : apikey,
		outputMode : this.SmartBookmarks.config.outputMode
	};
	
	var dataType = "json";
	var requestURL = this.SmartBookmarks.config.requestCategoryURL;
	
	// API request for getting the category of a URL
	this.jqueryREST(requestURL, data, callback, dataType);
}

/*
Make an Alchemy API Title REST request
*/
function alchemyTitle(url, callback)
{
	// Get the api key from local storage
	var apikey = getApiKey();

	//Create a local data object for the API request 
	var data = { 
		url : url,
		apikey : apikey,
		outputMode : this.SmartBookmarks.config.outputMode
	};
	
	var dataType = "json";
	var requestURL = this.SmartBookmarks.config.requestTitleURL;
	
	//API request for getting the category of a URL
	this.jqueryREST(requestURL, data, callback, dataType);
	
}

/*
Make an Alchemy API Topic REST request
*/
function alchemyTopic(url, callback)
{
	// Get the api key from local storage
	var apikey = getApiKey();

	//Create a local data object for the API request 
	var data = { 
		url : url,
		apikey : apikey,
		outputMode : this.SmartBookmarks.config.outputMode
	};
	
	var dataType = "json";
	var requestURL = this.SmartBookmarks.config.requestTopicURL;
	
	//API request for getting the category of a URL
	this.jqueryREST(requestURL, data, callback, dataType);
	
}

/******* FUNCTIONAL *******/
var Break = {toString: function() {return "Break";}};

function forEach(array, action) {
  try {
    for (var i = 0; i < array.length; i++)
      action(array[i]);
  }
  catch (exception) {
    if (exception != Break)
      throw exception;
  }
}

/******* CHROME CONTROL *******/
/*
Recurses through the bookmark tree looking for bookmarks that pass the test.

Needed because chrome.bookmarks.search() does not include folders in the result.
*/
function searchFolders(test, callback)
{
	var me = this;
	var ret = [];
	function testBookmarks(bookmarks) {
	  me.forEach(bookmarks, function(bookmark) {

		if (bookmark.children){
			testBookmarks(bookmark.children);
		}
	
		if(test.call(me, bookmark)){
			ret.push(bookmark);
		}

	  });

	  return ret;
	}
	
	chrome.bookmarks.getTree(function(bookmarks) {
		var ret = testBookmarks(bookmarks);
		callback.call(me, ret);
	});
}

/*
Get other bookmarks folder
*/
function getOtherBookmarks(callback) {
	// Get the ID of other bookmarks folder
	var me = this;
	getBookmarkChildren(SmartBookmarks.config.rootBookmarksKey.toString(), function(results) {
		var otherBookmarks = results[SmartBookmarks.config.otherBookmarksKey];
		callback.call(me, otherBookmarks);
	});
}

/*
Search bookmarks with query

Does not return folders
*/
function searchBookmarks(query, callback)
{
	return chrome.bookmarks.search(query, callback)
}

/*
Get a bookmark
*/
function getBookmark(id, callback)
{
	return chrome.bookmarks.get(id, callback);
}

/*
Get all bookmarks at id
*/
function getBookmarkChildren(id, callback)
{
	chrome.bookmarks.getChildren(id, callback);
}

/*
Removes all folders with the given name
Particularly useful in testing and damage control.
*/
function removeBookmarks(name)
{
	searchFolders(function(bookmark){return bookmark != undefined && bookmark.title == name; }, function(ret) {
		forEach(ret, function(bookmark){
			chrome.bookmarks.remove(bookmark.id, function() {});
		});
	});
}

/*
Moves a bookmark
*/
function moveBookmark(id, destination, callback) 
{
	chrome.bookmarks.move(id, destination, callback);
}

/*
Create a folder
*/
function createBookmark(bookmark, callback)
{
	chrome.bookmarks.create(bookmark, callback);
}

/*
Attach bookmark create event
*/
function chromeBookmarkOnCreated(callback)
{
	chrome.bookmarks.onCreated.addListener(callback);
}

/*
Detach bookmark create visted event
*/
function chromeBookmarksDetachCreated(callback)
{
	chrome.bookmarks.onCreated.removeListener(callback);
}

/*
Attach history on visted event
*/
function chromeHistoryOnVisited(callback)
{
	chrome.history.onVisited.addListener(callback);
}

/*
Detach history on visted event
*/
function chromeHistoryDetachVisited(callback)
{
	chrome.history.onVisited.removeListener(callback);
}

/* 
Detach alarm
*/
function chromeAlarmsDetach(name)
{
	chrome.alarms.clear(name);
}
/*
Get visits about a url
*/
function chromeGetVisits(url, callback)
{
	chrome.history.getVisits({url: url}, callback);
}

/*
Create alarm function
*/
function chromeDeployAlarm(name, callback, interval)
{
    chrome.alarms.create(name, {periodInMinutes : interval});
	chrome.alarms.onAlarm.addListener(callback);
}
