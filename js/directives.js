angular.module('twitterCrisis', ['ui.bootstrap', 'LocalStorageModule', 'colorpicker.module', 'angularMoment', 'ngRoute', 'ngSanitize'])

    /////////////////////////////////////////////////
    // Controller
    /////////////////////////////////////////////////
    .controller('Ctrl', function ($http, $scope, $interval, $compile, $filter, $modal, $route, $location, localStorageService) {
        // Set up datastructures
        $scope.tweets = {};
        $scope.CURRENT_COLS = [];
        $scope.CURRENT_COLS[0] = columnTemplate(0);
        $scope.showCreateNewTag = false;
        $scope.PAUSED_COLS = {};
        // format: {
        //          colId: {'recentTweet': 234902342, 'queued': 23},
        //          colId2: {'recentTweet': 234214231, 'queued': 54}
        //         }

        $scope.TAGS = TweetTags($http);
        $scope.USER_TAGS = UserTags($http);
        $scope.tag = {"newTagName": "", "color": '#' + Math.floor(Math.random() * 16777215).toString(16)};

        $scope.editTagPopOverOpen = false;
        $scope.colNum = 1; // TODO initialize this to (max stored col num) + 1
        getClients($http, $scope);


        ////////////////////////
        // Functions
        /////////////////////////
        $scope.getUsername = function () {
            return displayUsername(localStorageService);
        }

        $scope.logout = function () {
            delete $scope.clients[localStorage['ls.current_user']];
            destroyUser(localStorageService);
            //add a function to delete this client in the server
            getUser($http, $modal, localStorageService);
            getClients($http, $scope);
        }

        $scope.isPausedColumn = function (colId) {
            return (colId in $scope.PAUSED_COLS);
        }

        $scope.unpauseColumn = function (colId) {
            if (!$scope.isPausedColumn(colId)) {
                return;
            }
            delete $scope.PAUSED_COLS[colId];
            $("column-stream[col-id=" + colId + "]").removeClass("pausedColumn");
            $($("column-stream[col-id=" + colId + "]").find(".tweet-stream")).scrollTop(0);

            // Toggle icons
            var playIcon = $("column-stream[col-id=" + colId + "]").find(".play-button");
            var pauseIcon = $("column-stream[col-id=" + colId + "]").find(".pause-button");
            playIcon.css("opacity", 0.3);
            playIcon.parent().css("cursor", "default");
            console.log("playIcon.parent: ", playIcon.parent());
            pauseIcon.css("opacity", 1.0);
            pauseIcon.parent().css("cursor", "pointer");
        }

        $scope.pauseColumn = function (colId) {
            if ($scope.PAUSED_COLS.colId === colId) {
                return;
            }

            $("column-stream[col-id=" + colId + "]").addClass("pausedColumn");
            $scope.PAUSED_COLS[colId] = {'recentTweet': RECENT_ID, 'queued': 0};

            // Toggle icons
            var playIcon = $("column-stream[col-id=" + colId + "]").find(".play-button");
            var pauseIcon = $("column-stream[col-id=" + colId + "]").find(".pause-button");
            pauseIcon.css("opacity", 0.3);
            pauseIcon.parent().css("cursor", "default");
            playIcon.css("opacity", 1.0);
            playIcon.parent().css("cursor", "pointer");
        }


        $scope.editTagPopover = function (tag) {
            closeOtherTagPopovers(tag);
        };

        // Super hacky way to get focus on input box in tag editor
        // Also puts cursor at end of pre-filled text
        $scope.editTagPopoverSetup = function (tagname) {
            if (!$scope.editTagPopOverOpen && document.getElementById("editTagInputBox")) {
                var element = document.getElementById("editTagInputBox");
                element.setSelectionRange(tagname.length, tagname.length);
                element.focus();
                $scope.editTagPopOverOpen = true;
            }
            return true;
        }

        // opens up a new column, with a search box
        $scope.newColumnSearch = function () {
            $scope.createColumn($scope.colNum);
            // open search dropdown
            $("column-stream[col-id='" + $scope.colNum + "'] .dropdown-link").click();
            $scope.colNum = $scope.colNum + 1;
        };

        $scope.createColumn = function (newcolId) {
            // Make new column based on search
            $scope.CURRENT_COLS[newcolId] = {'colId': newcolId, 'search': searchTemplate(), 'showDropdown': true, 'started': false, 'tweets': []};
            var el = $compile("<column-stream col-id=" + newcolId + " ></column-stream>")($scope);
            $(el).addClass("newColumn").css("display", "none");
            $(".content").append(el);
            $(el).fadeIn("slow");
            $(".content").scrollLeft($(".content").width());
            setTimeout(function () {
                $(el).removeClass("newColumn");
                $(".content").scrollLeft($(".content").width());
            }, 500);
        };

        // saves a column's search
        $scope.saveSearch = function (colId) {
            // start this stream.
            $scope.CURRENT_COLS[colId].started = true;
            $scope.CURRENT_COLS[colId].showDropdown = false;

            // force update of 'columns' of existing tweets
            //$scope.TAGS.updateColumns($scope.tweets, $scope.tweets, $scope.CURRENT_COLS);
           // $scope.USER_TAGS.updateColumns($scope.tweets, $scope.tweets, $scope.CURRENT_COLS);

			// make a request to get more tweets to fill this column
			fillColumnWithTweets(colId);
        }

		function fillColumnWithTweets(colId) {
			$http.post(WEBSERVER + '/tweets/colId/', {'col':  $scope.CURRENT_COLS[colId]})
				 .success(function(response) {
					// add these tweets to our original tweet list
					// and add the tweet ids to this column's list of tweets
					for(var i in response.tweets){
						tweet = response.tweets[i];
						var colTweets = $scope.CURRENT_COLS[colId].tweets;
						if(colTweets.indexOf(tweet._id.$oid) < 0 ) {
							colTweets.push(tweet._id.$oid);
						}
						if(!$scope.tweets[tweet._id.$oid]){
							$scope.tweets[tweet._id.$oid] = tweet;
						}
					}
				  });
		}

        // Create a column that filters by the given tag
        $scope.newSearchByTagColumn = function (tag, searchType) {
            var search = searchTemplate();
            search.text = "" + tag.tag_name;
            search.searchType = searchType;
            if (searchType == 'tags') {
                search.tags[tag._id.$oid] = true;
            } else {
                search.userTags[tag._id.$oid] = true;
            }
            $scope.CURRENT_COLS[$scope.colNum] = {'colId': $scope.colNum, 'search': search, 'showDropdown': false, 'started': true, 'tweets': []};
            var el = $compile("<column-stream col-id=" + $scope.colNum + " ></column-stream>")($scope);
            $(el).addClass("newColumn").css("display", "none");
            $(".content").append(el);
            $(el).fadeIn("slow");
            $(".content").scrollLeft($(".content").width());
            setTimeout(function () {
                $(el).removeClass("newColumn");
                $(".content").scrollLeft($(".content").width());
            }, 500);

			// request tweets to fill this column
			fillColumnWithTweets($scope.colNum);

            $scope.colNum = $scope.colNum + 1;

            // force update of 'columns' of existing tweets
            //$scope.TAGS.updateColumns($scope.tweets, $scope.tweets, $scope.CURRENT_COLS);
            //$scope.USER_TAGS.updateColumns($scope.tweets, $scope.tweets, $scope.CURRENT_COLS);
        }

        $scope.deleteColumn = function (colId) {
            if (colId == 0) {
                return;
            } // don't let them delete the first column

            // check if any of this col's tweets can be removed
            var colTweets = $scope.CURRENT_COLS[colId].tweets;
            for(var i = 0; i < colTweets.length; i++) {
                var tweetId = colTweets[i];
                var tweet = $scope.tweets[tweetId];
                if(tweet && tweet.columns.length < 1 || (tweet.columns.length == 1 && tweet.columns[0] == colId)) {
                    console.log("deleting tweet, it has no cols");
                    delete $scope.tweets[tweetId];
                }
            }

            delete $scope.CURRENT_COLS[colId]
            $("column-stream[col-id=" + colId + "]").remove();
            var data = {'user': USER, 'colId': colId};
            $http.post(WEBSERVER + '/deletecolumn', data);


        }

        $scope.deleteLocalTag = function (type, tag) {
            if (type == 'tag') {
                delete $scope.displayedTags[tag._id.$oid];
            } else {
                delete $scope.displayedUserTags[tag._id.$oid];
            }
        }

        $scope.editedItem = null;

        $scope.startEditing = function (tag) {
            tag.editing = true;
            $scope.editedItem = tag;
        }

        $scope.doneEditing = function (type, tag) {
            tag.editing = false;
            $scope.editedItem = null;


            if (type == 'tag') {
                if (tag.tag_name != "" && tag.tag_name != null) {
                    $scope.TAGS.editTagText(tag);
                }
            } else {
                $scope.USER_TAGS.editTagText(tag);
            }

        }


        // open user list modal function call
        $scope.openUserListModal = function (userListName) {

            var modalInstance = $modal.open({
                templateUrl: 'user-list-modal.html',
                controller: openUserListModalInstanceCtrl,
                resolve: {
                    userList: function () {
                        // use line below when implemented getUserList
                        // return ModalInstanceCtrl.$scope.getUserList(userListName);
                        return userListName;
                    }

                }
            });
        };
        // open user list modal controller
        var openUserListModalInstanceCtrl = function ($scope, $modalInstance, userList) {

            $scope.users = ['user1', 'user2', 'user3'];

            $scope.userList = userList;

            $scope.deleteUser = function (user) {
                // serverDeleteUser(user)
            }

            $scope.addUser = function (user) {
                // serverAddUser(user)
            }

            $scope.getUserList = function (userListName) {
                //$scope.users = serverGetUserList(userListName);
                // get user list from server
            }

            $scope.close = function () {
                $modalInstance.dismiss('cancle');
            };
        };


        $scope.checkDeletable = function (tag, type) {

            // threshold for deleting tag
            if (tag.num_instances < 15) {
                if (type == "tags") {
                    $scope.TAGS.deleteTag(tag);
                } else {
                    $scope.USER_TAGS.deleteTag(tag);
                }
            } else {
                $scope.sureToDeleteModal(tag, type);
            }
        }


        // open user list modal function call
        $scope.sureToDeleteModal = function (tag, type) {

            var modalInstance = $modal.open({
                templateUrl: 'sure-to-delete-modal.html',
                controller: sureToDeleteModalInstanceCtrl,
                resolve: {
                    params: function () {
                        var params = {};
                        params['tag'] = tag;
                        if (type == "tags") {
                            params['TAGS'] = $scope.TAGS;
                            params['isUserTags'] = false;
                        } else {
                            params['TAGS'] = $scope.USER_TAGS;
                            params['isUserTags'] = true;
                        }
                        return params;
                    }
                }
            });
        };
        // open user list modal controller
        var sureToDeleteModalInstanceCtrl = function ($scope, $modalInstance, params) {

            $scope.TAGS = params['TAGS'];
            $scope.tag = params['tag'];
            $scope.isUserTags = params['isUserTags'];

            $scope.deleteTag = function () {
                $scope.TAGS.deleteTag($scope.tag);
                $modalInstance.dismiss('cancel');
            }

            $scope.close = function () {
                $modalInstance.dismiss('cancel');
            };
        };

        $scope.tagsIsCollapse = false;
        $scope.UserlistIsCollapse = false;
        $scope.CollabIsCollapse = false;

        $scope.collapseTag = function () {
            $scope.tagsIsCollapse = !$scope.tagsIsCollapse;
        }

        $scope.collapseUserlist = function () {
            $scope.UserlistIsCollapse = !$scope.UserlistIsCollapse;
        }

        $scope.collapseCollab = function () {
            $scope.CollabIsCollapse = !$scope.CollabIsCollapse;
        }

        // Set up initial user
        getUser($http, $modal, localStorageService);
        getUsersColumns($http, $scope, $location);
        getCurrentCrisis($http, $scope);

        // Start timer to constantly pull from DB
        $interval(function () {
            $scope.TAGS.updateTags($scope.editedItem);
            $scope.TAGS.updateTagInstances($scope.tweets, $scope.CURRENT_COLS);
            $scope.USER_TAGS.updateTags($scope.editedItem);
            $scope.USER_TAGS.updateTagInstances($scope.tweets, $scope.CURRENT_COLS);
            getTweets($http, $scope);
            getClients($http, $scope);

        }, 1 * 1000);

        // Set up new tag popover, tag edit popovers
        // setUpNewTagPopover($compile, $scope, "#newTagButton", "new-tag-popup");
        // setUpNewTagPopover($compile, $scope, "#newUserTagButton", "new-user-tag-popup");
        // setUpTagEditPopovers();
    })


    //////////////////////////////////////
    // Directives
    /////////////////////////////////////

    // Popup dialog for creating a new tag
    .directive("newTagPopup", function () {
        return {
            restrict: 'EA',
            transclude: false,    // Has to have the root scope
            scope: false,         // so it can have the same set of tags
            templateUrl: "newTag.html"
        }
    })

    .directive("newUserTagPopup", function () {
        return {
            restrict: 'EA',
            transclude: false,    // Has to have the root scope
            scope: false,         // so it can have the same set of tags
            templateUrl: "newUserTag.html"
        }
    })

    // Template for one column of tweets
    .directive("columnStream", function () {
        return {
            transclude: true,
            restrict: 'EA',
            templateUrl: 'column.html',
            scope: true,
            link: function (scope, element, attrs) {
                scope.colId = attrs["colId"];        // Inheriting scopes - independent for each col
                element.on("click", function (e) {
                    if (e.srcElement.id == "TagTweetButton") {
                        // if not paused, pause it!
                        if (!scope.isPausedColumn(scope.colId)) {
                            scope.pauseColumn(scope.colId);
                        }
                    }
                });
                $(element).find(".tweet-stream").bind("scroll", function () {
                    if ($($(element).find(".tweet-stream")).scrollTop() > 0) {
                        if (!scope.isPausedColumn(scope.colId)) {
                            scope.pauseColumn(scope.colId);
                        }
                    } else {
                        scope.unpauseColumn(scope.colId);
                    }
                    scope.$apply();
                });
            }
        };
    })

    // Template for a dynamically resizing window
    // Makes the window take up as much height as it can, and a width of 320px
    .directive('resize', function () {
        return function (scope, element) {
            var w = $(window);
            scope.getWindowDimensions = function () {
                return { 'h': w.height() };
            };
            scope.$watch(scope.getWindowDimensions, function (newValue, oldValue) {
                scope.windowHeight = newValue.h;

                scope.style = function () {
                    var windowHeight = $(window).height();
                    var headerHeight = $(".tweet-header").height();
                    return {
                        'height': (windowHeight - headerHeight - 32) + 'px'
                    };
                };

            }, true);

            w.bind('resize', function () {
                scope.$apply();
            });
        }
    })

    .directive('resize-left-column', function () {
        return function (scope, element) {
            var w = $(window);
            scope.getWindowDimensions = function () {
                return { 'h': w.height(), 'w': w.width() };
            };
            scope.$watch(scope.getWindowDimensions, function (newValue, oldValue) {
                scope.windowHeight = newValue.h;
                scope.windowWidth = newValue.w;

                scope.style = function () {
                    var windowHeight = $(window).height();
                    var headerHeight = $(".fix-banner").height();
                    return {
                        'max-height': (windowHeight - headerHeight) + 'px'
                    };
                };

            }, true);

            w.bind('resize-left-column', function () {
                scope.$apply();
            });
        }
    })

    // Directive to handle missing profile pictures
    .directive('errSrc', function () {
        return {
            link: function (scope, element, attrs) {
                element.bind('error', function () {
                    element.attr('src', attrs.errSrc);
                });
            }
        }
    })

    // Template for one single tweet
    .directive("tweet", function () {
        return {
            restrict: 'EA',
            transclue: true,
            scope: true,
            replace: true,
            templateUrl: 'tweet.html',
            link: function (scope, element, attrs) {
                attrs.$observe('tweet', function (tweet) {
					scope.tweet = scope.$parent.$parent.$parent.tweets[scope.tweet];
                   /* if (scope.$parent) {
                        scope.tweet = scope.$parent.tweet;
                    }*/
                });
                ;
            }
        };
    })

    // Stop search refinement dropdown from closing
    .directive('stopEvent', function () {
        return {
            restrict: 'A',
            link: function (scope, element, attr) {
                element.bind(attr.stopEvent, function (e) {
                    e.stopPropagation();
                });
            }
        };
    })


    //Credit for ngBlur and ngFocus to
    // https://github.com/addyosmani/todomvc/blob/master/architecture-examples/angularjs/js/directives/
    .directive('ngBlur', function () {
        return function (scope, elem, attrs) {
            elem.bind('blur', function () {
                scope.$apply(attrs.ngBlur);
            });
        };
    })

    .directive('ngFocus', function ($timeout) {
        return function (scope, elem, attrs) {
            scope.$watch(attrs.ngFocus, function (newval) {
                if (newval) {
                    $timeout(function () {
                        elem[0].focus();
                    }, 0, false);
                }
            });
        };
    })


    ////////////////////////////////////////////
    // Filters
    ////////////////////////////////////////////

    // Reverse items in an array.
    .filter('reverse', function () {
        return function (items) {
            return items.slice().reverse();
        };
    })

    // Filter tweets specific to each column, as well
    // as limit the number of tweets per column to 75.
    .filter('columnSpecific', function () {
        return function (items, colId, scope) {
            colId = parseInt(colId)
            var arrayToReturn = [];
            if (!scope.CURRENT_COLS[colId] || !scope.CURRENT_COLS[colId].started) {
                return arrayToReturn;
            }
            if (items) {
                var count = 0;
                for (var i = 0; i < items.length; i++) {
                    if (items[i].columns.indexOf(colId) != -1) { // this tweet should be in my column
                        if (!scope.isPausedColumn(colId)) {  //the column is not being paused
                            arrayToReturn.push(items[i]);
                        } else if (scope.isPausedColumn(colId) &&  // the column is paused
                            items[i].id <= scope.PAUSED_COLS[colId].recentTweet) {  // enforce "pausing"
                            arrayToReturn.push(items[i]);
                        } else {
                            // Column paused, tweet is being filtered
                            count++;
                        }
                    }
                }
                if (scope.isPausedColumn(colId)) {
                    scope.PAUSED_COLS[colId].queued = count;
                }
            }
            // limit number of tweets in a column
            if (arrayToReturn.length > MAX_TWEETS_PER_COLUMN) {
                arrayToReturn.splice(MAX_TWEETS_PER_COLUMN);
            }
            return arrayToReturn;
        }
    })


	.filter('orderByTime', function() {
		return function(items, colId, scope) {
			// sort tweets
			var filtered = [];
			angular.forEach(items, function(item) {	  
			  if(scope.tweets[item]) { filtered.push(item); }
			});
			filtered.sort(function (a, b) {
			  return scope.tweets[b].unix_time - scope.tweets[a].unix_time;
			});

			// trim, if necessary
			var colTweets = filtered;
			if(colTweets.length > 40) {
				// remove this col from tweets' column array
				for(var i = 20; i < colTweets.length; i++) {
					var tweet = scope.tweets[colTweets[i]];
					if(tweet.columns) {
						var index = tweet.columns.indexOf(parseInt(colId));
						if(index >= 0) {
							tweet.columns.splice(index, 1);
						}
						// Delete this tweet, it has no columns
						if(tweet.columns.length == 0) {
								console.log("deleting tweet, it has no cols");
								delete scope.tweets[tweet._id.$oid];	
						}
					}
				}	
				// murder tweets
				filtered = filtered.slice(0, 20);
				scope.CURRENT_COLS[colId].tweets = filtered;		
			}
			return filtered;
		}
	});


//////////////////////////////////////////
// One off JS Functions
//////////////////////////////////////////

// Pull current crisis information from the database
function getCurrentCrisis($http, $scope) {
    $http.get(WEBSERVER + '/eventTitle').success(function (response) {
        $scope.currentCrisis = response;
    });
}

function getUsersColumns($http, $scope, $location) {
    // TODO initialize $scope.colNum to max. col id + 1
    if ($location.search()) {
        // Use provided URL template
        var object = $location.search();
        angular.forEach(object, function (value, key) {
            if (key.indexOf("column") >= 0)
                $scope.createColumn(value);
        });
    } else {
        // Pull from DB
        $http.get(WEBSERVER + '/columns/' + USER).success(function (response) {
            for (var i = 0; i < response.columns.length; i++) {
                $scope.createColumn(response.columns[i].colId);
            }
        });
    }
}

// Template for unfiltered column
function columnTemplate(colId) {
    return {'colId': colId,
        'search': searchTemplate(),
        'showDropdown': false,
		'tweets' : [], /* list of tweet ids of tweets that belong in this column */
        'started': true};
}

function searchTemplate() {
    return {'textFilter': false, 'text': '',
        'usersFilter': false, 'users': '',
        'tagsFilter': false, 'tags': {},
        'userTagsFilter': false, 'userTags': {}, 'searchType': 'text'};
}
