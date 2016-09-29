/*
 * Responsible for the main app, providing config and model<-> hash
 * functionality for the other controllers
 */
aardvark.directive('aardvarkEnter', function() {
        return function(scope, element, attrs) {
            element.bind("keydown keypress", function (event) {
               if (event.which == 13) {
                   scope.$apply(function() {
                       scope.$eval(attrs.aardvarkEnter);
                   })

                   event.preventDefault();
               }
            });
        }
    })
    .directive('aardvarkLoad', function() {
        return function(scope, element, attrs) {
            element.bind("load", function (event) {
               scope.$apply(function() {
                   scope.$eval(attrs.aardvarkLoad);
               })

               event.preventDefault();
            });
        }
    })
    .controller('AardvarkCtrl', [ '$rootScope', '$scope', '$http', '$location', 'serialisation', 'localStorageService', 'tsdbClient', function AardvarkCtrl($rootScope, $scope, $http, $location, $serialisation, $localStorageService, $tsdbClient) {
        /*
         * Model persistence - ensures that persistent data is saved to the hash whilst leaving
         * controllers free to litter their own scope with volatile data. Controllers are responsible
         * for correctly populating any derivable volatile data from persistent on page load
         */
        $rootScope.model = {
            global: {},
            metrics: [],
            graphs: []
        };
        
        /*
         * Config management - we have config loaded from the server, plus a capability to enable
         * controllers to register for notifications of updates to the config
         */
        $rootScope.configListeners = [];

        $rootScope.config = null;
        $rootScope.graphTypes = [ "gnuplot", "horizon", "dygraph", "scatter", "heatmap" ];

        $rootScope.activeTimeoutId = null;


        /*
         auto-updating ui when tabbing out of changed fields / changing radio buttons etc
         */
        $scope.uiAutoUpdate = false;
        $rootScope.renderGraphsIfAutoUpdate = function() {
            if ($scope.uiAutoUpdate) {
                $rootScope.renderGraphs();
            }
        }
        $rootScope.autoUpdateEnabled = function() {
            return $scope.uiAutoUpdate;
        }

        $rootScope.loadModel = function() {
            var hash = $location.hash();
            if (hash != null && hash!="") {
                while (hash.indexOf("#") == 0) {
                    hash = hash.substring(1);
                }
                hash = decodeURI(hash);
                $rootScope.model = $serialisation.deserialise(hash);
            }
            else {
                // there's a hash in there already
                if ($location.absUrl().indexOf("/#/") > 0) {
                    hash = $location.path();
                    while (hash.indexOf("/") == 0) {
                        hash = hash.substring(1);
                    }
                    hash = decodeURI(hash);
                    $rootScope.model = $serialisation.deserialise(hash);
                }
            }
        }
        
        $rootScope.saveModel = function(render) {
//            console.log("slimmed ser:");
//            var originalLen = JSON.stringify($rootScope.model).length;
            var serialised = $serialisation.serialise($rootScope.model);
            // there's a hash in the path in the url, some horrendousness going on
            if ($location.absUrl().indexOf("/#/") > 0) {
                $location.path("");
            }
            $location.hash(serialised);
            
            $rootScope.resetAutoReload();
            
            if (render && $rootScope.renderGraphs) {
                $rootScope.renderGraphs();
            }
        }
        
        $rootScope.resetAutoReload = function() {
            if ($rootScope.activeTimeoutId != null) {
                clearTimeout($rootScope.activeTimeoutId);
                $rootScope.activeTimeoutId = null;
            }
            if ($rootScope.model.global.autoReload) {
                try {
                    var period = parseInt($rootScope.model.global.autoReloadPeriod);
                    if (period > 0) {
                        var func = function() {
                            $rootScope.renderGraphs();
                            $rootScope.activeTimeoutId = setTimeout(func, period*1000);
                        }
                        $rootScope.activeTimeoutId = setTimeout(func, period * 1000);
                    }
                    
                }
                catch (e) {
                    // ignore
                }
            }
        }
    
        /**
         * Register a listener for updates to config. Will call the given callback:
         * 1. When the config object is successfully loaded from the server
         * 2. If the config object was already loaded when this method was called
         * Note this might result in 2 calls in quick succession due to race conditions, callers
         * must be able to handle this.
         * @param func The callback
         */
        $rootScope.onConfigUpdate = function(func) {
            $rootScope.configListeners.push(func);
            if ($rootScope.config) {
                func();
            }
        }
    
        $rootScope.updateConfig = function() {
            $http.get('/aardvark/config').success(function(json) {
                // apply some defaults..
                if (!json.tsdbProtocol) {
                    json.tsdbProtocol = "http";
                }
                if (!json.annotations) {
                    json.annotations = {
                        allowDelete: true
                    };
                }
                
                json.tsdbBaseReadUrl = json.tsdbProtocol + "://" + json.tsdbHost + ":" + json.tsdbPort;
                if (json.tsdbWriteHost || json.tsdbWritePort) {
                    json.tsdbBaseWriteUrl = json.tsdbProtocol + "://" +
                        (json.tsdbWriteHost ? json.tsdbWriteHost : json.tsdbHost) + ":" +
                        (json.tsdbWritePort ? json.tsdbWritePort : json.tsdbPort);
                }
                else {
                    json.tsdbBaseWriteUrl = json.tsdbBaseReadUrl;
                }
                
                var applyConfig = function() {
                    $rootScope.config = json;
                    for (var i=$rootScope.configListeners.length-1; i>=0; i--) {
                        $rootScope.configListeners[i]();
                    }
                }
                
                // not a controller so has no reference to $rootScope to get the config via callback
                $tsdbClient.init(json);
                // now give config to everyone else
                applyConfig();
            });
        };
    
        $rootScope.clearAll = function() {
            $rootScope.model = {
                global: {},
                metrics: [],
                graphs: []
            };
            $rootScope.saveModel(true);
            // force everything to re-initialise
            $rootScope.updateConfig();
            
        }
    
        $rootScope.formEncode = function(val) {
            var ret = val.replace(" ","+");
            if (ret != val) {
                return $rootScope.formEncode(ret);
            }
            return ret;
        }
        
        $scope.bindUserPreferences = function() {
            $scope.uiAutoUpdate = $localStorageService.get('uiAutoUpdate') == "true";
            $scope.$watch('uiAutoUpdate', function() {
                $localStorageService.set('uiAutoUpdate', $scope.uiAutoUpdate);
            });
        }
    
        $scope.bindUserPreferences();
        $rootScope.loadModel();
        $rootScope.updateConfig();
        $rootScope.resetAutoReload();
    }]);