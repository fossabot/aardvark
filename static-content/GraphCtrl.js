/*
 * Graph rendering
 */
aardvark.controller('GraphCtrl', [ '$scope', '$rootScope', '$http', '$uibModal', 'tsdbClient', 'tsdbUtils', function GraphCtrl($scope, $rootScope, $http, $uibModal, $tsdbClient, $tsdbUtils) {
    
    $scope.renderedContent = {};
    $scope.renderErrors = {};
    $scope.renderWarnings = {};
    $scope.renderMessages = {};
    $scope.imageRenderCount = 0;
    $scope.hiddenElements = {};
    $scope.renderListeners = {};
    $scope.dygraphs = {};

    // pre-defined in unit tests
    if (!$scope.renderers) {
        $scope.renderers = {};
    }
    if (!$scope.renderedGraphs) {
        $scope.renderedGraphs = {};
    }

    $scope.renderers["gnuplot"] = {
        create: function() {
            var tsdbRendererLink = function(path, global, graph, metrics, addIgnore) {

                var yAxisParams = {};
                var y2AxisParams = {};
                var keyParams = null;
                var lineSmoothing = false;
                var style = null;
                var globalAnnotations = null;

                if (graph.gnuplot != null) {
                    // yAxisParams
                    if (graph.gnuplot.y1AxisLabel != null && graph.gnuplot.y1AxisLabel != "") {
                        yAxisParams.label = graph.gnuplot.y1AxisLabel;
                    }
                    if (graph.gnuplot.y1AxisFormat != null && graph.gnuplot.y1AxisFormat != "") {
                        yAxisParams.format = graph.gnuplot.y1AxisFormat;
                    }
                    if (graph.gnuplot.y1AxisRange != null && graph.gnuplot.y1AxisRange != "") {
                        yAxisParams.range = graph.gnuplot.y1AxisRange;
                    }
                    yAxisParams.logscale = graph.gnuplot.y1AxisLogScale != null && graph.gnuplot.y1AxisLogScale;

                    // y2AxisParams
                    if (graph.gnuplot.y2AxisLabel != null && graph.gnuplot.y2AxisLabel != "") {
                        y2AxisParams.label = graph.gnuplot.y2AxisLabel;
                    }
                    if (graph.gnuplot.y2AxisFormat != null && graph.gnuplot.y2AxisFormat != "") {
                        y2AxisParams.format = graph.gnuplot.y2AxisFormat;
                    }
                    if (graph.gnuplot.y2AxisRange != null && graph.gnuplot.y2AxisRange != "") {
                        y2AxisParams.range = graph.gnuplot.y2AxisRange;
                    }
                    y2AxisParams.logscale = graph.gnuplot.y2AxisLogScale != null && graph.gnuplot.y2AxisLogScale;

                    // keyParams
                    if (graph.gnuplot.showKey != null && (graph.gnuplot.showKey == true)) {
                        var keyLocation = graph.gnuplot.keyLocation;
                        switch (keyLocation) {
                            case 'out top left':
                            case 'out top center':
                            case 'out top right':
                            case 'top left':
                            case 'top center':
                            case 'top right':
                            case 'out center left':
                            case 'center left':
                            case 'center':
                            case 'center right':
                            case 'out center right':
                            case 'bottom left':
                            case 'bottom center':
                            case 'bottom right':
                            case 'bottom top left':
                            case 'bottom top center':
                            case 'bottom top right':
                                break;
                            default:
                                $scope.renderWarnings[graph.id] = "Invalid key location specified '"+keyLocation+"', defaulting to top left";
                                keyLocation = 'top left';
                        }
                        keyParams = {
                            keyLocation: keyLocation,
                            keyAlignment: graph.gnuplot.keyAlignment,
                            keyBox: graph.gnuplot.keyBox != null && graph.gnuplot.keyBox
                        }
                    }

                    // smoothing
                    lineSmoothing = graph.gnuplot.lineSmoothing != null && graph.gnuplot.lineSmoothing;

                    // style
                    if (graph.gnuplot.style != null && graph.gnuplot.style != "") {
                        style = graph.gnuplot.style;
                    }

                    // global annotations
                    globalAnnotations = graph.gnuplot.globalAnnotations;
                }

                return $scope.tsdbGraphUrl(path, global, graph, metrics, /*forceAxis*/null, /*downsampleOverrideFn*/null, yAxisParams, y2AxisParams, keyParams, lineSmoothing, style, globalAnnotations, addIgnore);
            };
            var ret = {
                type: "gnuplot",
                supports_tsdb_export: true,
                supports_grafana_export: false,
                tsdb_export_link: "",
                grafana_export_text: ""
            };
            ret.render = function(global, graph, metrics) {
                if ($scope.renderedContent[graph.id] == null) {
                    $scope.renderedContent[graph.id] = { src: "", width: 0, height: 0 };
                }
                $scope.renderMessages[graph.id] = "Loading...";
                ret.tsdb_export_link = "";

                var url = tsdbRendererLink("/q?", global, graph, metrics, true);

                if (url != null) {
                    url += "&png";

                    var width = Math.floor(graph.graphWidth);
                    var height = Math.floor(graph.graphHeight);

                    url += "&wxh="+width+"x"+height;

                    $scope.renderedContent[graph.id] = { src: url, width: width, height: height };
                    ret.tsdb_export_link = tsdbRendererLink("/#", global, graph, metrics, false);
                }
            }
            return ret;
        }
    };

    $scope.renderers["horizon"] = {
        create: function() {
            var ret = {
                type: "horizon",
                supports_tsdb_export: true,
                supports_grafana_export: false,
                tsdb_export_link: "",
                grafana_export_text: ""
            };
            ret.render = function(global, graph, metrics) {
                $scope.renderMessages[graph.id] = "Loading...";
                ret.tsdb_export_link = "";
                var divSelector = "#horizonDiv_"+graph.id;

                var s = 1000;
                var m = s * 60;
                var h = m * 60;
                var d = h * 24;
                var w = d * 7;

                var steps = [s,10*s,20*s,30*s,m,1*m,2*m,5*m,10*m,15*m,20*m,30*m,h,2*h,3*h,4*h,6*h,12*h,d,2*d,w];
                for (var i=2; i<=52; i++) {
                    steps.push(i*w);
                }

                // cubism plots a pixel per step, so we need to calculate step size (we ignore downsampling time measure)
                var width = Math.floor(graph.graphWidth);
                var height = Math.floor(graph.graphHeight);
                var start = $scope.tsdb_fromTimestampAsMoment(global);
                var stop = $scope.tsdb_toTimestampAsMoment(global);
                var diff = moment.utc().diff(start);
                var timeWidthMillis = stop.diff(start);
                var rawStepSize = timeWidthMillis / width;
                var stepSize = steps[0];
                for (var i=0; i<steps.length-1; i++) {
                    //console.log("considering "+steps[i]+" < " + rawStepSize + " <= "+steps[i+1]);
                    if (steps[i] < rawStepSize && rawStepSize <= steps[i+1]) {
                        stepSize = steps[i+1];
                        break;
                    }
                }

                var downsampleTo = !(stepSize % 86400000) ? stepSize / 86400000 + "d" :
                    !(stepSize % 3600000) ? stepSize / 3600000 + "h" :
                        !(stepSize % 60000) ? stepSize / 60000 + "m" :
                            stepSize / 1000 + "s";

                // now recalculate width so we get the time range requested
                width = Math.ceil(timeWidthMillis / stepSize);

                // construct the query string for these metrics, when we have a response, then use that to construct
                //    constant metrics (data already loaded) for time series which are returned.

                var fromTimestamp = $scope.tsdb_fromTimestampAsTsdbString(global);
                // validation
                if (fromTimestamp == null || fromTimestamp == "") {
                    $scope.renderErrors[graph.id] = "No start date specified";
                    return;
                }
                if (metrics == null || metrics.length == 0) {
                    $scope.renderErrors[graph.id] = "No metrics specified";
                    return;
                }

                // url construction
                var downsampleOverrideFn = function(by) {return downsampleTo+"-"+(by?by:"avg")};

                var url = $rootScope.config.tsdbBaseReadUrl+"/api/query";

                url += "?" + $scope.tsdb_queryString(global, graph, metrics, null, downsampleOverrideFn);

                url += "&ms=true&arrays=true&show_query=true";

                // now we have the url, so call it!
                $http.get(url, {withCredentials:$rootScope.config.authenticatedReads}).success(function (json) {
                    // now we have an array of lines, so let's convert them to metrics

                    var interpolate = graph.horizon && graph.horizon.interpolateGaps;
                    var squash = graph.horizon && graph.horizon.squashNegative;

                    var parsed = $scope.cubism_parser(json, start, stepSize, stop, interpolate, squash); // array response
                    // construct cMetrics
                    var cMetrics = [];

                    var context = cubism.context()
                        .serverDelay(diff)
                        .step(stepSize)
                        .size(width)
                        .stop();

                    var addMetric = function(cMetrics, metricData, name)
                    {
                        cMetrics.push(context.metric(function (start, stop, step, callback) {
                            callback(null, metricData);
                        }, name));
                    }



                    for (var i=0; i<parsed.length; i++) {
                        var name = $scope.timeSeriesName(json[i]);
                        addMetric(cMetrics, parsed[i], name);
                    }

                    // remove old horizon charts
                    d3.select(divSelector)
                        .selectAll(".horizon")
                        .remove();
                    // remove everything else
                    d3.select(divSelector)
                        .selectAll(".axis")
                        .remove();
                    d3.select(divSelector)
                        .selectAll(".rule")
                        .remove();
                    d3.select(divSelector)
                        .selectAll(".value")
                        .remove();

                    var cubism_axisFormatSeconds = d3.time.format("%H:%M:%S"),
                        cubism_axisFormatMinutes = d3.time.format("%H:%M"),
                        cubism_axisFormatDays = d3.time.format("%B %d");

                    var axisFormat = context.step() < 6e4 ? cubism_axisFormatSeconds
                        : context.step() < 864e5 ? cubism_axisFormatMinutes
                        : cubism_axisFormatDays;

                    d3.select(divSelector)
                        .selectAll(".axis")
                        .data(["top", "bottom"])
                        .enter()
                        .append("div")
                        .attr("id", function(d) {
                            return "horizonAxis_" + d + "_" + graph.id;
                        })
                        .attr("class", function(d) {
                            return d + " axis";
                        })
                        .each(function(d) {
                            d3.select(this).call(context.axis().focusFormat(axisFormat).ticks(12).orient(d));
                        });

                    context.on("focus", function(i) {
                        d3.selectAll(".value").style("right", "10px");
                    });

                    var topAxisBox = d3.select("#horizonAxis_top_"+graph.id).node().getBoundingClientRect();
                    var bottomAxisBox = d3.select("#horizonAxis_bottom_"+graph.id).node().getBoundingClientRect();

                    var topAxisHeight = topAxisBox.height;
                    var bottomAxisHeight = bottomAxisBox.height;
                    var totalAxesHeight = topAxisHeight + bottomAxisHeight;

                    var minLineHeight = 25;
                    var maxLineHeight = 60;

                    var perLineHeight = ((height - totalAxesHeight)/cMetrics.length)-2;
                    perLineHeight = Math.min(Math.max(perLineHeight,minLineHeight),maxLineHeight);
                    d3.select(divSelector).selectAll(".horizon")
                        .data(cMetrics)
                        .enter().insert("div", ".bottom")
                        .attr("class", "horizon")
                        .call(context.horizon().height(perLineHeight).format(d3.format(".2f")));

                    var leftOffsetContainer = {
                        leftOffset: 0
                    }

                    // rendering of graphs doesn't change horizontal location
                    // NOTE: resizing of window does, but we don't try and handle that (yet)
                    var graphContentPanel = d3.select("#graph-content-panel").node().getBoundingClientRect();
                    var ruleLeft = graphContentPanel.left;
                    leftOffsetContainer.leftOffset = ruleLeft;
                    // now we can add rule safely as we know height as well
                    d3.select(divSelector).append("div")
                        .attr("class", "rule")
                        .attr("id","horizonRule_"+graph.id)
                        .call($scope.cubism_rule(context, leftOffsetContainer));
                    //                .call(context.rule());


                    var resizeFocusRule = function() {
                        //var graphPanelBox = d3.select("#graph-content-panel").node().getBoundingClientRect();
                        // top needs to be relative to the whole window
                        var ruleTop = topAxisBox.top;
                        var ruleHeight = totalAxesHeight + (perLineHeight * cMetrics.length);
                        // and now we just go find the rule we added and set the top/height
                        d3.select("#horizonRule_"+graph.id)
                            .select(".line")
                            .style("top", ruleTop+"px")
                            .style("height",ruleHeight+"px")
                            .style("bottom",null);
                    }

                    resizeFocusRule();

                    $scope.addGraphRenderListener(function (graphId) {
                        if (graphId != graph.id) {
                            resizeFocusRule();
                        }
                    });

                    var yAxisParams = {
                        squashNegative: squash
                    };
                    ret.tsdb_export_link = $scope.tsdbGraphUrl("/#", global, graph, metrics, "x1y1", downsampleOverrideFn, yAxisParams, /*y2AxisParams*/null, /*keyParams*/{}, /*lineSmoothing*/false, /*style*/null, /*globalAnnotations*/false);
                    $scope.renderMessages[graph.id] = "";
                    $scope.graphRendered(graph.id);
                    return;
                })
                    .error(function (arg) {
                        $scope.renderMessages[graph.id] = "Error loading data: "+arg;
                        return;
                    });
            }
            return ret;
        }
    };

    $scope.renderers["heatmap"] = {
        create: function() {
            var ret = {
                type: "heatmap",
                supports_tsdb_export: true,
                supports_grafana_export: false,
                tsdb_export_link: "",
                grafana_export_text: ""
            };
            ret.render = function(global, graph, metrics) {
                ret.tsdb_export_link = "";

                // validation
                var fromTimestamp = $scope.tsdb_fromTimestampAsTsdbString(global);
                if (fromTimestamp == null || fromTimestamp == "") {
                    $scope.renderErrors[graph.id] = "No start date specified";
                    return;
                }
                if (metrics == null || metrics.length == 0) {
                    $scope.renderErrors[graph.id] = "No metrics specified";
                    return;
                }
                if (metrics.length != 1) {
                    $scope.renderErrors[graph.id] = "Require exactly 1 metric, currently have "+metrics.length;
                    return;
                }

                $scope.renderMessages[graph.id] = "Loading...";
                var divSelector = "#heatmapDiv_"+graph.id;

                var heatmapOptions = graph.heatmap;
                if (!heatmapOptions) {
                    heatmapOptions = {};
                }

                var width = Math.floor(graph.graphWidth);
                var height = Math.floor(graph.graphHeight);

                var fromDateTime = $scope.tsdb_fromTimestampAsMoment(global);
                var toDateTime = $scope.tsdb_toTimestampAsMoment(global);

                var fromYear = fromDateTime.year();
                var toYear = toDateTime.year();
                var numYears = (toYear - fromYear) + 1;

                var fromMonth = fromYear*12 + fromDateTime.month();
                var toMonth = toYear*12 + toDateTime.month();
                var numMonths = (toMonth - fromMonth) + 1;

                // depending on the heatmap style, the number of squares per row/column will vary, these 
                // need to be integer values so we will calculate appropriate values for the
                // size of the graph
                var style = heatmapOptions.style ? heatmapOptions.style : "auto";
                if (style == "auto") {
                    // if style is auto, we guess passed on toTimestamp-fromTimestamp
                    var diff = toDateTime.diff(fromDateTime, 'years', true);
                    style = diff > 1 ? "week_day" : "day_hour";
                }
                switch (style) {
                    case 'week_day':
                    case 'day_hour':
                        break;
                    default:
                        $scope.renderErrors[graph.id] = "Unsupported graph style: "+style;
                        return;
                }

                // calculate max cell size that fits data in width and height
                var minCellSize = 5;
                var cellSize = minCellSize;
                var cols = 0;
                var rows = 0;
                var downsampleTo = null;
                if (style == "week_day") {
                    var cellSizeFromWidth = (width - 20) / 53; // weeks in a year, after space for year text
                    var cellSizeFromHeight = height / (numYears * 8); // min height of a year view is 8 cells, 7 for days, plus 1 padding
                    cellSize = Math.min(cellSizeFromWidth, cellSizeFromHeight);
                    downsampleTo = "1d";
                }
                else if (style == "day_hour") {
                    downsampleTo = "1h";
                    cellSize = minCellSize;
                    //            console.log("width = "+width);
                    //            console.log("height = "+height);
                    for (rows=1; ; rows++) {
                        //                console.log("Processing ROWS = "+rows)

                        var maxMonthHeight = height / rows;
                        var candidateCellSizeFromHeight = Math.floor(maxMonthHeight / 25);
                        //                console.log("maxMonthHeight = "+maxMonthHeight+", candidateCellSizeFromHeight="+candidateCellSizeFromHeight);

                        var maxMonthsInRow = Math.ceil(numMonths / rows);
                        var numRowsWithCells = Math.ceil(numMonths / maxMonthsInRow);
                        //                console.log("maxMonthsInRow = "+maxMonthsInRow+", numRowsWithCells="+numRowsWithCells);

                        var candidateMonthWidthFromWidth = Math.floor(width / maxMonthsInRow)
                        var candidateCellSizeFromWidth = (candidateMonthWidthFromWidth - 20) / 31;
                        //                console.log("candidateMonthWidthFromWidth = "+candidateMonthWidthFromWidth+", candidateCellSizeFromWidth="+candidateCellSizeFromWidth);
                        for ( ; ; candidateCellSizeFromWidth--) {
                            var totalHeightFromCellSizeFromWidth = numRowsWithCells * candidateCellSizeFromWidth * 25;
                            if (totalHeightFromCellSizeFromWidth <= height) {
                                //                        console.log("totalHeightFromCellSizeFromWidth = "+totalHeightFromCellSizeFromWidth+", candidateCellSizeFromWidth="+candidateCellSizeFromWidth);
                                break;
                            }
                        }
                        var candidateCellSize = Math.min(candidateCellSizeFromHeight, candidateCellSizeFromWidth);

                        if (candidateCellSize > cellSize || rows == 1) {
                            cellSize = candidateCellSize;
                            //                    console.log("Appears we're better off with "+rows+" rows: "+cellSize);
                            var monthHeight = cellSize * 25;
                            var monthWidth = (cellSize * 31) + 20;
                            //                    console.log("Gives us w x h of "+monthWidth+"x"+monthHeight);
                        }
                        else {
                            //                    console.log("Appears we were better off with "+(rows-1)+" rows: "+candidateCellSize);
                            rows--;
                            cols = Math.ceil(numMonths/rows);
                            break;
                        }
                    }
                    // that gives us a single column, but perhaps if we go to 2 columns we can have larger cells
                }


                // min value
                if (cellSize < minCellSize) {
                    cellSize = minCellSize;
                    if (style == "week_day") {
                        height = cellSize * (numYears * 8);
                    }
                    else if (style == "day_hour") {
                        height = cellSize * (numMonths * 25);
                    }
                }

                // url construction
                var downsampleOverrideFn = function(by) {return downsampleTo+"-"+(by?by:"avg")};
                var url = $rootScope.config.tsdbBaseReadUrl+"/api/query";

                url += "?" + $scope.tsdb_queryString(global, graph, metrics, null, downsampleOverrideFn);

                url += "&ms=true&arrays=true";

                // now we have the url, so call it!
                $http.get(url, {withCredentials:$rootScope.config.authenticatedReads}).success(function (json) {
                    if (json.length != 1) {
                        $scope.renderErrors[graph.id] = "TSDB results doesn't contain exactly 1 metric, was "+json.length;
                        $scope.renderMessages[graph.id] = "";
                        return;
                    }

                    var series = json[0];

                    if (heatmapOptions.excludeNegative) {
                        for (var i=0; i<series.dps.length; i++) {
                            if (series.dps[i][1] < 0) {
                                series.dps[i][1] = 0;
                            }
                        }
                    }

                    var isFilteredOutFn = function(value) {
                        return false;
                    }
                    var tsdbLinkRangeLower = "";
                    var tsdbLinkRangeUpper = "";
                    if ((heatmapOptions.filterLowerBound != null && heatmapOptions.filterLowerBound != "") || (heatmapOptions.filterUpperBound != null && heatmapOptions.filterUpperBound != "")) {
                        if (heatmapOptions.filterUpperBound == null || heatmapOptions.filterUpperBound == "") {
                            try {
                                var lower = parseInt(heatmapOptions.filterLowerBound);
                                tsdbLinkRangeLower = lower;
                                isFilteredOutFn = function(value) {
                                    return value < lower
                                };
                            }
                            catch (e) {
                                // ignore
                            }
                        }
                        else if (heatmapOptions.filterLowerBound == null || heatmapOptions.filterLowerBound == "") {
                            try {
                                var upper = parseInt(heatmapOptions.filterUpperBound);
                                tsdbLinkRangeUpper = upper;
                                isFilteredOutFn = function(value) {
                                    return value > upper
                                };
                            }
                            catch (e) {
                                // ignore
                            }
                        }
                        else {
                            try {
                                var lower = parseInt(heatmapOptions.filterLowerBound);
                                var upper = parseInt(heatmapOptions.filterUpperBound);
                                tsdbLinkRangeLower = lower;
                                tsdbLinkRangeUpper = upper;
                                isFilteredOutFn = function(value) {
                                    return value < lower || value > upper
                                };
                            }
                            catch (e) {
                                // ignore
                            }
                        }
                    }

                    // remove old heatmaps..
                    d3.select(divSelector)
                        .selectAll("svg")
                        .remove();

                    var heatmap = $scope.heatmap()
                        .cellSize(cellSize)
                        .scale(d3.scale.quantize())
                        .dps(series.dps)
                        .width(width)
                        .height(height)
                        .colourScheme(heatmapOptions.colourScheme);

                    if (style == "week_day") {
                        heatmap.weekDayRender(divSelector, fromYear, toYear, isFilteredOutFn);
                    }
                    else if (style == "day_hour") {
                        heatmap.dayHourRender(divSelector, fromMonth, toMonth, isFilteredOutFn);
                    }

                    if (heatmapOptions.excludeNegative && true && (tsdbLinkRangeLower == "" || tsdbLinkRangeLower < 0)) {
                        tsdbLinkRangeLower = 0;
                    }
                    var yAxisParams = {
                        range: "[" + tsdbLinkRangeLower + ":" + tsdbLinkRangeUpper + "]"
                    };
                    ret.tsdb_export_link = $scope.tsdbGraphUrl("/#", global, graph, metrics, "x1y1", downsampleOverrideFn, yAxisParams, /*y2AxisParams*/null, /*keyParams*/{}, /*lineSmoothing*/false, /*style*/null, /*globalAnnotations*/false);
                    $scope.renderMessages[graph.id] = "";
                    $scope.graphRendered(graph.id);
                    return;
                })
                    .error(function (arg) {
                        $scope.renderMessages[graph.id] = "Error loading data: "+arg;
                        return;
                    });
            }
            return ret;
        }
    };

    // todo: specifying ratio and auto scale is going to look darn odd - need to decide what to do - add issue for this..
    $scope.renderers["dygraph"] = {
        create: function() {
            var ret = {
                type: "dygraph",
                supports_tsdb_export: true,
                supports_grafana_export: false,
                tsdb_export_link: "",
                grafana_export_text: ""
            };
            ret.render = function(global, graph, metrics, datum) {
                ret.tsdb_export_link = "";
                var fromTimestamp = $scope.tsdb_fromTimestampAsTsdbString(global);
                // validation
                if (fromTimestamp == null || fromTimestamp == "") {
                    $scope.renderErrors[graph.id] = "No start date specified";
                    return;
                }
                if (metrics == null || metrics.length == 0) {
                    $scope.renderErrors[graph.id] = "No metrics specified";
                    return;
                }

                var dygraphOptions = graph.dygraph;
                if (!dygraphOptions) {
                    dygraphOptions = {};
                }

                if (dygraphOptions.countFilter != null && dygraphOptions.countFilter.count + "" != "" && dygraphOptions.countFilter.count < 1) {
                    $scope.renderErrors[graph.id] = "Minimum count for filtering is 1";
                    return;
                }
                if (dygraphOptions.valueFilter != null && dygraphOptions.valueFilter.lowerBound != "" && dygraphOptions.valueFilter.upperBound != "" && dygraphOptions.valueFilter.lowerBound > dygraphOptions.valueFilter.upperBound) {
                    $scope.renderErrors[graph.id] = "Upper bound on value filter is less than lower bound";
                    return;
                }
                if (dygraphOptions.valueFilter != null && dygraphOptions.valueFilter.lowerBound != "" && dygraphOptions.valueFilter.upperBound != "" && dygraphOptions.valueFilter.lowerBound == dygraphOptions.valueFilter.upperBound) {
                    $scope.renderWarnings[graph.id] = "Lower bound on value filter is same as upper bound";
                }
                var parseAxisRange = function(axisRangeString) {
                    var toReturn = [null, null]
                    if (axisRangeString != null && axisRangeString != "") {
                        var s = axisRangeString.replace("[","").replace("]","");
                        var colon = s.indexOf(":");
                        var error = false;
                        if (colon > 0) {
                            try {
                                var low = s.substring(0,colon);
                                if (low != "") {
                                    toReturn[0] = parseInt(low);
                                }
                                var high = s.substring(colon+1);
                                if (high != "") {
                                    toReturn[1] = parseInt(high);
                                }
                            }
                            catch (parseError) {
                                error = true;
                            }
                        }
                        else {
                            error = true;
                        }
                        if (error) {
                            $scope.renderWarnings[graph.id] = "Y-axis value range invalid, defaulting to [:]";
                            toReturn = [null,null];
                        }
                    }
                    return toReturn;

                }
                var y1AxisRange = parseAxisRange(dygraphOptions.y1AxisRange);
                var y2AxisRange = parseAxisRange(dygraphOptions.y2AxisRange);

                $scope.renderMessages[graph.id] = "Loading...";

                var constructUrls = function(queryStringFn, datum) {
                    // split metrics up so that we end up with only a single instance of each metric in each set of queries
                    var metricIndexes = {};
                    var maxCount = 0;
                    for (var m=0; m<metrics.length; m++) {
                        if (!metricIndexes.hasOwnProperty(metrics[m].name)) {
                            metricIndexes[metrics[m].name] = [];
                        }
                        metricIndexes[metrics[m].name].push(m);
                        maxCount = Math.max(maxCount, metricIndexes[metrics[m].name].length);
                    }
                    var seperatedMetricsDicts = [];
                    var seperatedMetricsArrays = [];
                    for (var i=0; i<maxCount; i++) {
                        var dict = {};
                        var arr = [];
                        for (var metricName in metricIndexes) {
                            if (metricIndexes.hasOwnProperty(metricName)) {
                                if (metricIndexes[metricName].length > i) {
                                    var metric = metrics[metricIndexes[metricName][i]];
                                    dict[metricName] = metric;
                                    arr.push(metric)
                                }
                            }
                        }
                        seperatedMetricsDicts.push(dict);
                        seperatedMetricsArrays.push(arr);
                    }

                    var ret = [];
                    for (var i=0; i<maxCount; i++) {

                        var url = $rootScope.config.tsdbBaseReadUrl+"/api/query?";

                        url += queryStringFn(global, graph, seperatedMetricsArrays[i], null, datum);

                        if (dygraphOptions.annotations || dygraphOptions.globalAnnotations) {
                            url += "&show_tsuids=true";
                            if (dygraphOptions.globalAnnotations) {
                                url += "&global_annotations=true";
                            }
                        }
                        else {
                            url += "&no_annotations=true";
                        }

                        url += "&ms=true&arrays=true&show_query=true";
                        ret.push({metrics: seperatedMetricsDicts[i], url: url});
                    }
                    return ret;
                }


                var mainJson = null;
                var baselineJson = null;

                var errorResponse = false;

                // baseline approach
                // 1. make both queries
                // 2. link results together so that we have a way of mapping from main to baseline
                // 3. perform filtering based on main, but remove matching baseline if exclude
                // 4. initial label setting (both sets)
                // 5. auto-scaling and label adjustment (both together)
                // 6. baseline time adjustment
                // 7. min/max time calculations (together)
                // 8. seperate processing
                //  a. ratio graphs
                //  b. mean adjustment
                //  c. negative squashing
                // 9. gap filling / merge timeseries (together)
                // 10. merge labels
                // 11. render graph

                var processJson = function() {
                    if (!mainJson || mainJson.length == 0) {
                        $scope.renderErrors[graph.id] = "Empty response from TSDB";
                        $scope.renderMessages[graph.id] = "";
                        return;
                    }
                    var baselining = global.baselining;
                    if ((baselining && (!baselineJson || baselineJson.length == 0))) {
                        $scope.renderWarnings[graph.id] = "Empty response from TSDB for baseline query";
                        baselining = false;
                    }

                    var width = Math.floor(graph.graphWidth);
                    var height = Math.floor(graph.graphHeight);

                    var graphData = [];

                    // 3. perform filtering based on main, but remove matching baseline if exclude 
                    var filteredOut = [];
                    var measured = null;
                    if (dygraphOptions.countFilter != null && dygraphOptions.countFilter.count != "" && dygraphOptions.countFilter.count < mainJson.length) {
                        measured = new Array(mainJson.length);
                        var sorted = new Array(mainJson.length);
                        for (var i=0; i<mainJson.length; i++) {
                            switch (dygraphOptions.countFilter.measure) {
                                case "mean":
                                    measured[i] = 0;
                                    for (var p=0; p<mainJson[i].dps.length; p++) {
                                        measured[i] +=  mainJson[i].dps[p][1];
                                    }
                                    measured[i] /= mainJson[i].dps.length;
                                    break;
                                case "min":
                                    measured[i] = Number.MAX_VALUE;
                                    for (var p=0; p<mainJson[i].dps.length; p++) {
                                        measured[i] = Math.min(measured[i], mainJson[i].dps[p][1]);
                                    }
                                    break;
                                case "max":
                                    measured[i] = Number.MIN_VALUE;
                                    for (var p=0; p<mainJson[i].dps.length; p++) {
                                        measured[i] = Math.max(measured[i], mainJson[i].dps[p][1]);
                                    }
                                    break;
                            }
                            sorted[i] = measured[i];
                        }
                        // increasing order
                        sorted.sort(function(a,b){return a-b;}); // default sort is alphanumeric!
                        if (dygraphOptions.countFilter.end == "top") {
                            var thresholdIndex1 = (mainJson.length - dygraphOptions.countFilter.count);
                            var threshold1 = sorted[thresholdIndex1];
                            for (var i=mainJson.length-1; i>=0; i--) {
                                if (measured[i] < threshold1) {
                                    filteredOut.push(mainJson[i]);
                                    mainJson.splice(i,1);
                                    measured.splice(i,1);
                                }
                            }
                        }
                        else if (dygraphOptions.countFilter.end == "bottom") {
                            var thresholdIndex2 = dygraphOptions.countFilter.count - 1;
                            var threshold2 = sorted[thresholdIndex2];
                            for (var i=mainJson.length-1; i>=0; i--) {
                                if (measured[i] > threshold2) {
                                    filteredOut.push(mainJson[i]);
                                    mainJson.splice(i,1);
                                    measured.splice(i,1);
                                }
                            }
                        }
                    }
                    if (dygraphOptions.valueFilter != null && (dygraphOptions.valueFilter.lowerBound != "" || dygraphOptions.valueFilter.upperBound != "")) {
                        if ((dygraphOptions.countFilter && dygraphOptions.valueFilter.measure != dygraphOptions.countFilter.measure) || measured == null) {
                            measured = new Array(mainJson.length);
                            for (var i=0; i<mainJson.length; i++) {
                                switch (dygraphOptions.valueFilter.measure) {
                                    case "mean":
                                        measured[i] = 0;
                                        for (var p=0; p<mainJson[i].dps.length; p++) {
                                            measured[i] +=  mainJson[i].dps[p][1];
                                        }
                                        measured[i] /= mainJson[i].dps.length;
                                        break;
                                    case "min":
                                        measured[i] = Number.MAX_VALUE;
                                        for (var p=0; p<mainJson[i].dps.length; p++) {
                                            measured[i] = Math.min(measured[i], mainJson[i].dps[p][1]);
                                        }
                                        break;
                                    case "max":
                                        measured[i] = Number.MIN_VALUE;
                                        for (var p=0; p<mainJson[i].dps.length; p++) {
                                            measured[i] = Math.max(measured[i], mainJson[i].dps[p][1]);
                                        }
                                        break;
                                }
                            }
                        }
                        var include = new Array(mainJson.length);
                        for (var i=mainJson.length-1; i>=0; i--) {
                            include[i] = true;
                            switch (dygraphOptions.valueFilter.measure) {
                                case "mean":
                                case "min":
                                case "max":
                                    if (dygraphOptions.valueFilter.lowerBound != "") {
                                        if (measured[i] < dygraphOptions.valueFilter.lowerBound) {
                                            include[i] = false;
                                        }
                                    }
                                    if (dygraphOptions.valueFilter.upperBound != "") {
                                        if (measured[i] > dygraphOptions.valueFilter.upperBound) {
                                            include[i] = false;
                                        }
                                    }
                                    break;
                                case "any":
                                    include[i] = false;
                                    for (var p=0; p<mainJson[i].dps.length; p++) {
                                        var includePoint = true;
                                        if (dygraphOptions.valueFilter.lowerBound != "") {
                                            if (mainJson[i].dps[p][1] < dygraphOptions.valueFilter.lowerBound) {
                                                includePoint = false;
                                            }
                                        }
                                        if (dygraphOptions.valueFilter.upperBound != "") {
                                            if (mainJson[i].dps[p][1] > dygraphOptions.valueFilter.upperBound) {
                                                includePoint = false;
                                            }
                                        }
                                        if (includePoint) {
                                            include[i] = true;
                                            break;
                                        }

                                    }
                            }
                            if (!include[i]) {
                                filteredOut.push(mainJson[i]);
                                mainJson.splice(i,1);
                                measured.splice(i,1);
                            }
                        }
                    }

                    if (mainJson.length == 0) {
                        $scope.renderErrors[graph.id] = "Value filtering excluded all time series";
                        $scope.renderMessages[graph.id] = "";
                        return;
                    }

                    // now filter out of baselineJson based on filteredOut
                    if (baselining && measured != null) {
                        var filteredOutByQuery = {};
                        for (var s=0; s<filteredOut.length; s++) {
                            var str = JSON.stringify(filteredOut[s].query);
                            if (!(str in filteredOutByQuery)) {
                                filteredOutByQuery[str] = [];
                            }
                            filteredOutByQuery[str].push(filteredOut[s]);
                        }

                        var allTagsMatch = function(tags1, tags2) {
                            var tagsArray1 = [];
                            for (var k in tags1) {
                                if (tags1.hasOwnProperty(k)) {
                                    tagsArray1.push(k);
                                }
                            }
                            var tagsArray2 = [];
                            for (var k in tags2) {
                                if (tags2.hasOwnProperty(k)) {
                                    tagsArray2.push(k);
                                }
                            }
                            if (tagsArray1.length != tagsArray2.length) {
                                return false;
                            }
                            for (var i=0; i<tagsArray1.length; i++) {
                                var k = tagsArray1[i];
                                if (tags2.hasOwnProperty(k)) {
                                    if (tags1[k] != tags2[k]) {
                                        return false;
                                    }
                                }
                                else {
                                    return false;
                                }
                            }
                            return true;
                        }

                        for (var s=baselineJson.length-1; s>=0; s--) {
                            var str = JSON.stringify(baselineJson[s].query);
                            // ok, we have definitely removed some results from this query
                            if (str in filteredOutByQuery) {
                                for (var i=0; i<filteredOutByQuery[str].length; i++) {
                                    if (allTagsMatch(baselineJson[s].tags, filteredOutByQuery[str][i].tags)) {
                                        baselineJson.splice(s,1);
                                        filteredOutByQuery[str].splice(i,1);
                                        if (filteredOutByQuery[str].length == 0) {
                                            delete filteredOutByQuery[str];
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                    }


                    // indices, used to track progress through dps arrays
                    var mainIndices1 = new Array(mainJson.length);
                    var mainIndices2 = new Array(mainJson.length);
                    var mainIndices3 = new Array(mainJson.length);
                    for (var s=0; s<mainJson.length; s++) {
                        mainIndices1[s] = 0;
                        mainIndices2[s] = 0;
                        mainIndices3[s] = 0;
                    }
                    var baselineIndices1;
                    var baselineIndices2;
                    var baselineIndices3;
                    if (baselining) {
                        baselineIndices1 = new Array(baselineJson.length);
                        baselineIndices2 = new Array(baselineJson.length);
                        baselineIndices3 = new Array(baselineJson.length);
                        for (var s=0; s<baselineJson.length; s++) {
                            baselineIndices1[s] = 0;
                            baselineIndices2[s] = 0;
                            baselineIndices3[s] = 0;
                        }
                    }

                    // now we've filtered we can work out the set of annotations which need rendering
                    var annotations = [];
                    var discoverAnnotations = function(json, indices, isBaseline) {
                        var globalAnnotations = [];
                        for (var s=0; s<json.length; s++) {
                            if (json[s].annotations != null) {
                                json[s].annotations.sort(function(a,b){
                                    var ret = a.startTime - b.startTime;
                                    if (ret == 0) {
                                        if (a.endTime == null || b.endTime == null) {
                                            return 0;
                                        }
                                        return a.endTime - b.endTime;
                                    }
                                    return ret;
                                });
                                for (var p= 0, a=0; p<json[s].dps.length && a<json[s].annotations.length; ) {
                                    var t = json[s].dps[p][0];
                                    var annT = json[s].annotations[a].startTime; // todo: how do we represent endTime with dygraph?
                                    if (t < annT) {
                                        // annotation after last point
                                        if (p == json[s].dps.length - 1) {
                                            // add a point at the end
                                            // let dygraphs interpolate
                                            json[s].dps.push([annT,null]);
                                            // insert annotation
                                            annotations.push([json[s], json[s].annotations[a], isBaseline]);
                                            // next annotation
                                            a++;
                                        }
                                        // annotation after a mid point
                                        else {
                                            p++;
                                        }
                                    }
                                    else if (t == annT) {
                                        // we have a point at the correct time, this is good
                                        //                            console.log("inserting annotation at existing point")
                                        annotations.push([json[s], json[s].annotations[a], isBaseline]);
                                        a++;
                                    }
                                    else { // t > annT
                                        // annotation needs to go in here
                                        // let dygraphs interpolate
                                        json[s].dps.splice(p,0,[annT,null]);
                                        // insert annotation
                                        annotations.push([json[s], json[s].annotations[a], isBaseline]);
                                        // next annotation
                                        a++;
                                    }
                                }
                            }
                            if (dygraphOptions.globalAnnotations && globalAnnotations.length == 0 && json[s].globalAnnotations.length > 0) {
                                globalAnnotations = json[s].globalAnnotations;
                                globalAnnotations.sort(function(a,b){
                                    var ret = a.startTime - b.startTime;
                                    if (ret == 0) {
                                        if (a.endTime == null || b.endTime == null) {
                                            return 0;
                                        }
                                        return a.endTime - b.endTime;
                                    }
                                    return ret;
                                });
                            }
                        }
                        if (dygraphOptions.globalAnnotations && globalAnnotations.length > 0) {
                            for (var a=0; a<globalAnnotations.length; a++) {
                                var annT = globalAnnotations[a].startTime;
                                var hitAtTime = false;
                                for (var s=0; s<json.length; s++) {
                                    while (indices[s] < json[s].dps.length && json[s].dps[indices[s]][0] < annT) {
                                        indices[s]++;
                                    }
                                    if (indices[s] < json[s].dps.length && json[s].dps[indices[s]][0] == annT) {
                                        hitAtTime = true;
                                    }
                                }
                                // now each index is either past the end of the points, or dps[index].time >= annotation.startTime
                                var annotationAdded = false;
                                for (var s=0; s<json.length; s++) {
                                    var p = indices[s];
                                    if (p < json[s].dps.length) {
                                        var t = json[s].dps[indices[s]][0];
                                        if (t == annT) {
                                            if (!annotationAdded) {
                                                annotations.push([json[s], globalAnnotations[a], isBaseline]);
                                                annotationAdded = true;
                                            }
                                        }
                                        else { // t > annT
                                            // ensure it gets added somewhere, so here is good enough
                                            if (!hitAtTime && !annotationAdded) {
                                                annotations.push([json[s], globalAnnotations[a], isBaseline]);
                                                // put in a null point here
                                                json[s].dps.splice(p,0,[annT,null]);
                                                annotationAdded = true;
                                            }
                                        }
                                    }
                                    // past end of dps
                                    else if (!annotationAdded) {
                                        annotations.push([json[s], globalAnnotations[a], isBaseline]);
                                        json[s].dps.push([annT, null]);
                                        annotationAdded = true;
                                    }
                                }
                            }
                        }
                    }
                    if (dygraphOptions.annotations) {
                        discoverAnnotations(mainJson, mainIndices1, false);
                        if (baselining) {
                            discoverAnnotations(baselineJson, baselineIndices1, true);
                        }
                    }

                    var isY1Axis = function (axis) {
                        return axis==null || axis=="x1y1";
                    }

                    var isY2Axis = function (axis) {
                        return axis=="x1y2";
                    }

                    // 4. initial label setting (both sets) and axis allocation
                    var mainLabels = ["x"];
                    var baselineLabels = ["x"];
                    var seriesOptions = {};
                    for (var t=0; t<mainJson.length; t++) {
                        var name = $scope.timeSeriesName(mainJson[t]);
                        mainLabels.push(name);
                        var axis = isY1Axis(mainJson[t].aardvark_metric.graphOptions.axis) ? "y1" : "y2";
                        seriesOptions[name] = { axis: axis };
                    }
                    if (baselining) {
                        for (var t=0; t<baselineJson.length; t++) {
                            var name = $scope.timeSeriesName(baselineJson[t]);
                            baselineLabels.push(name+"[BL]");
                            var axis = isY1Axis(baselineJson[t].aardvark_metric.graphOptions.axis) ? "y1" : "y2";
                            seriesOptions[name+"[BL]"] = { axis: axis };
                        }
                    }

                    var isNegativeSquashingEnabled = function(json) {
                        return (isY1Axis(json.aardvark_metric.graphOptions.axis) && dygraphOptions.y1SquashNegative)
                            || (isY2Axis(json.aardvark_metric.graphOptions.axis) && dygraphOptions.y2SquashNegative);
                    }

                    var scaleMultiplierByMetricNameY1 = {}; // default 1
                    var scaleMultiplierByMetricNameY2 = {}; // default 1
                    var autoScale = function(axisMatchFn, perAxisScaleMultipliers) {
                        // 5. auto-scaling and label adjustment (both together)

                        var initScaleMultipliers = function(json) {
                            for (var s=0; s<json.length; s++) {
                                if (axisMatchFn(json[s].aardvark_metric.graphOptions.axis)) {
                                    perAxisScaleMultipliers[json[s].metric] = 1;
                                }
                            }
                        }
                        initScaleMultipliers(mainJson);
                        if (baselining) {
                            initScaleMultipliers(baselineJson);
                        }

                        var maxValueByMetricName = {};

                        var calcMaxValues = function(json) {
                            for (var s=0; s<json.length; s++) {
                                if (axisMatchFn(json[s].aardvark_metric.graphOptions.axis)) {
                                    perAxisScaleMultipliers[json[s].metric] = 1;
                                    var max = 0;
                                    var min = Number.MAX_VALUE;
                                    for (var p=0; p<json[s].dps.length; p++) {
                                        max = Math.max(max, json[s].dps[p][1]);
                                        min = Math.min(min, json[s].dps[p][1]);
                                    }
                                    if (!isNegativeSquashingEnabled(json[s]) && min < 0) {
                                        max = Math.max(max, Math.abs(min));
                                    }
                                    if (maxValueByMetricName[json[s].metric] == null)
                                    {
                                        maxValueByMetricName[json[s].metric] = max;
                                    }
                                    else {
                                        maxValueByMetricName[json[s].metric] = Math.max(maxValueByMetricName[json[s].metric], max);
                                    }
                                }
                            }
                        }

                        calcMaxValues(mainJson);
                        if (baselining) {
                            calcMaxValues(baselineJson);
                        }

                        var maxl = 0;
                        for (var metric in maxValueByMetricName) {
                            var logMax = parseInt(Math.log(maxValueByMetricName[metric])/Math.log(10));
                            if (logMax>maxl) {
                                maxl = logMax;
                            }
                        }

                        for (var metric in maxValueByMetricName) {
                            var pow = parseInt(Math.log(maxValueByMetricName[metric])/Math.log(10));
                            var l = maxl - pow;
                            if (l > 0) {
                                perAxisScaleMultipliers[metric] = Math.pow(10, l);
                            }
                        }

                        var updateScaleFactors = function(json, labels) {
                            for (var s=0;s<json.length;s++) {
                                if (axisMatchFn(json[s].aardvark_metric.graphOptions.axis)) {
                                    var scale = perAxisScaleMultipliers[json[s].metric];
                                    if (scale > 1) {
                                        var oldLabel = labels[s+1];
                                        var newLabel = scale+"x "+labels[s+1];
                                        labels[s+1] = newLabel;
                                        seriesOptions[newLabel] = seriesOptions[oldLabel];
                                        delete seriesOptions[oldLabel];
                                    }
                                }
                            }
                        }
                        updateScaleFactors(mainJson, mainLabels);
                        if (baselining) {
                            updateScaleFactors(baselineJson, baselineLabels);
                        }
                    }

                    if (dygraphOptions.y1AutoScale) {
                        autoScale(isY1Axis, scaleMultiplierByMetricNameY1);
                    }

                    if (dygraphOptions.y2AutoScale) {
                        autoScale(isY2Axis, scaleMultiplierByMetricNameY2);
                    }

                    // 6. baseline time adjustment
                    if (baselining) {
                        var baselineOffset = $scope.baselineOffset(global, datum).asMilliseconds();
                        for (var s=0; s<baselineJson.length; s++) {
                            for (var p=0; p<baselineJson[s].dps.length; p++) {
                                baselineJson[s].dps[p][0] += baselineOffset;
                            }
                        }
                    }

                    // 7. min/max time calculations (together)
                    var minTime = new Date().getTime() + 86400000; // now + 1 day so we don't hit tz issues
                    var maxTime = 0
                    for (var s=0; s<mainJson.length; s++) {
                        if (mainJson[s].dps.length > 0) {
                            minTime = Math.min(minTime, mainJson[s].dps[0][0]);
                            maxTime = Math.max(maxTime, mainJson[s].dps[mainJson[s].dps.length-1][0]);
                        }
                    }
                    if (baselineJson != null) {
                        for (var s=0; s<baselineJson.length; s++) {
                            if (baselineJson[s].dps.length > 0) {
                                minTime = Math.min(minTime, baselineJson[s].dps[0][0]);
                                maxTime = Math.max(maxTime, baselineJson[s].dps[baselineJson[s].dps.length-1][0]);
                            }
                        }
                    }
                    if (maxTime == 0) {
                        minTime == 0;
                    }

                    var ignoredOptions = [];
                    if (dygraphOptions.ratioGraph) {
                        if (dygraphOptions.meanAdjusted) {
                            ignoredOptions.push("mean adjustment");
                        }
                        if (dygraphOptions.y1AutoScale || dygraphOptions.y2AutoScale) {
                            ignoredOptions.push("auto scaling");
                        }
                    }
                    else if (dygraphOptions.meanAdjusted) {
                        if (dygraphOptions.y1AutoScale || dygraphOptions.y2AutoScale) {
                            ignoredOptions.push("auto scaling");
                        }
                    }
                    var ignoredBecause = null;

                    // 8. seperate processing
                    //  a. ratio graphs
                    //  b. mean adjustment
                    //  c. negative squashing
                    var seperateProcessing = function(json, indices) {
                        //                console.log("seperateProcessing:");
                        //                console.log("json = "+JSON.stringify(json));
                        for (var t=minTime; t<=maxTime; ) {
                            //                    console.log("t = "+t);
                            var nextTime = maxTime + 1; // break condition
                            var sum = 0; // for mean adjusted graphs
                            var hadValue = [];
                            for (var s=0; s<json.length; s++) {
                                hadValue.push(false);
                                if (indices[s] >= json[s].dps.length) {
                                    // skip this one
                                }
                                else if (json[s].dps[indices[s]][0] == t) {
                                    hadValue[s] = true;
                                    var val = json[s].dps[indices[s]][1];
                                    if (isNegativeSquashingEnabled(json[s]) && val < 0) {
                                        json[s].dps[indices[s]][1] = 0;
                                        val = 0;
                                    }
                                    indices[s]++;
                                    if (indices[s] < json[s].dps.length) {
                                        nextTime = Math.min(nextTime, json[s].dps[indices[s]][0]);
                                    }
                                    if (dygraphOptions.ratioGraph) {
                                        sum += Math.abs(val);
                                    }
                                    else if (dygraphOptions.meanAdjusted) {
                                        sum += val;
                                    }
                                }
                                else {
                                    nextTime = Math.min(nextTime, json[s].dps[indices[s]][0]);
                                }
                            }
                            if (dygraphOptions.ratioGraph) {
                                for (var s=0; s<json.length; s++) {
                                    if (hadValue[s] && json[s].dps[indices[s]-1][1]!=null && !isNaN(json[s].dps[indices[s]-1][1])) {
                                        json[s].dps[indices[s]-1][1] = (json[s].dps[indices[s]-1][1] * 100) / sum;
                                    }
                                }
                                ignoredBecause = "ratio graphs";
                            }
                            else if (dygraphOptions.meanAdjusted) {
                                var mean = sum / json.length;
                                for (var s=0; s<json.length; s++) {
                                    //                            console.log("s = "+s);
                                    //                            console.log("indices[s] = "+indices[s]);
                                    if (hadValue[s] && json[s].dps[indices[s]-1][1]!=null && !isNaN(json[s].dps[indices[s]-1][1])) {

                                        //                                console.log("val = "+json[s].dps[indices[s]-1][1]);
                                        //                                console.log("mean = "+mean);
                                        json[s].dps[indices[s]-1][1] -= mean;
                                    }
                                }
                                ignoredBecause = "mean adjustment";
                            }
                            else {
                                if (dygraphOptions.y1AutoScale) {
                                    for (var s=0; s<json.length; s++) {
                                        if (isY1Axis(json[s].aardvark_metric.graphOptions.axis)) {
                                            if (hadValue[s] && json[s].dps[indices[s]-1][1]!=null && !isNaN(json[s].dps[indices[s]-1][1])) {
                                                json[s].dps[indices[s]-1][1] *= scaleMultiplierByMetricNameY1[json[s].metric];
                                            }
                                        }
                                    }
                                    ignoredBecause = "auto scaling";
                                }
                                if (dygraphOptions.y2AutoScale) {
                                    for (var s=0; s<json.length; s++) {
                                        if (isY2Axis(json[s].aardvark_metric.graphOptions.axis)) {
                                            if (hadValue[s] && json[s].dps[indices[s]-1][1]!=null && !isNaN(json[s].dps[indices[s]-1][1])) {
                                                json[s].dps[indices[s]-1][1] *= scaleMultiplierByMetricNameY2[json[s].metric];
                                            }
                                        }
                                    }
                                    ignoredBecause = "auto scaling";
                                }
                            }
                            t = nextTime;
                        }
                    }

                    seperateProcessing(mainJson, mainIndices2);
                    if (baselining) {
                        seperateProcessing(baselineJson, baselineIndices2);
                    }

                    // ie we had some clashes and some data..
                    if (ignoredBecause != null && ignoredOptions.length > 0) {
                        var buff = "";
                        var sep = "Ignored ";
                        for (var i=0; i<ignoredOptions.length; i++) {
                            buff += sep + ignoredOptions[i];
                            sep = " and ";
                        }
                        buff += " as not compatible with " + ignoredBecause;

                        $scope.renderWarnings[graph.id] = buff;
                    }

                    // 9. gap filling / merge timeseries (together)
                    for (var t=minTime; t<=maxTime; ) {
                        var row = [new Date(t)];
                        var nextTime = maxTime + 1; // break condition
                        var gapFillAndMergeJson = function(json, indices) {
                            for (var s=0; s<json.length; s++) {
                                // gap filling
                                if (indices[s] >= json[s].dps.length) {
                                    row.push(null);
                                }
                                else if (json[s].dps[indices[s]][0] == t) {
                                    var val = json[s].dps[indices[s]][1];
                                    row.push(val);
                                    indices[s]++;
                                    if (indices[s] < json[s].dps.length) {
                                        nextTime = Math.min(nextTime, json[s].dps[indices[s]][0]);
                                    }
                                }
                                else {
                                    row.push(null);
                                    nextTime = Math.min(nextTime, json[s].dps[indices[s]][0]);
                                }
                            }
                        }
                        gapFillAndMergeJson(mainJson, mainIndices3);
                        if (baselining) {
                            gapFillAndMergeJson(baselineJson, baselineIndices3);
                        }
                        graphData.push(row);
                        t = nextTime;
                    }

                    // 10. merge labels
                    var labels = mainLabels;
                    if (baselining) {
                        for (var s=1; s<baselineLabels.length; s++) {
                            labels.push(baselineLabels[s]);
                        }
                    }

                    // default to no-op
                    var dygraphPointClickHandler = null;
                    var dygraphAnnotationClickHandler = null;


                    var config = {
                        labels: labels,
                        width: width,
                        height: height,
                        legend: "always",
                        pointClickCallback: function(event, p) {
                            if (dygraphPointClickHandler != null) {
                                dygraphPointClickHandler(event,p);
                            }
                        },
                        annotationClickHandler: function(ann, point, dg, event) {
                            if (dygraphAnnotationClickHandler != null) {
                                dygraphAnnotationClickHandler(ann, point, dg, event);
                            }
                        },
                        stackedGraph: dygraphOptions.stackedLines,
                        connectSeparatedPoints: dygraphOptions.interpolateGaps,
                        drawGapEdgePoints: true,
                        axisLabelFontSize: 9,
                        labelsDivStyles: { fontSize: 9, textAlign: 'left', left: '100px', width: (width-100)+'px', "background-color": 'rgba(255,255,255,0)', "padding-top": '20px' },
                        labelsDivWidth: (width-100),
                        labelsSeparateLines: true,
                        series: seriesOptions,
                        axes: {
                            y: {
                                valueFormatter: function(y) {
                                    if (isNaN(y) || y < 1000) {
                                        return "" + y;
                                    }
                                    return y.toString().replace(/\B(?=(?:\d{3})+(?!\d))/g, ",")
                                },
                                axisLabelFormatter: function(y) {
                                    if (isNaN(y) || y < 1000) {
                                        return "" + Dygraph.round_(y, 3);
                                    }
                                    return y.toString().replace(/\B(?=(?:\d{3})+(?!\d))/g, ",")
                                },
                                valueRange: y1AxisRange,
                                logscale: dygraphOptions.y1Log
                            },
                            y2: {
                                valueFormatter: function(y) {
                                    if (isNaN(y) || y < 1000) {
                                        return "" + y;
                                    }
                                    return y.toString().replace(/\B(?=(?:\d{3})+(?!\d))/g, ",")
                                },
                                axisLabelFormatter: function(y) {
                                    if (isNaN(y) || y < 1000) {
                                        return "" + Dygraph.round_(y, 3);
                                    }
                                    return y.toString().replace(/\B(?=(?:\d{3})+(?!\d))/g, ",")
                                },
                                valueRange: y2AxisRange,
                                logscale: dygraphOptions.y2Log

                            }
                        }
                    };
                    if (dygraphOptions.highlightLines) {
                        config.highlightSeriesOpts = {
                            strokeWidth: 3,
                            strokeBorderWidth: 1,
                            highlightCircleSize: 5
                        };
                        /*
                         config.highlightCallback = function(event, x, points, row, seriesName) {
                         if (labelsDiv) {
                         //find the y val
                         var yval = '';
                         for (var i=0;i<points.length;i++) {
                         if (points[i].name==seriesName) {
                         yval = points[i].yval;
                         break;
                         }
                         }
                         labelsDiv.innerHTML = "<span><b>" + seriesName + "</b>" + " "
                         + Dygraph.hmsString_(x) + ", " + yval + "</span>";
                         }
                         }*/

                    }

                    var dygraph = $scope.dygraph_render("dygraphDiv_"+graph.id, graph.id, graphData, config);

                    var createDygraphAnnotation = function(g, seriesAndAnnotation) {
                        var series = seriesAndAnnotation[0];
                        var annotation = seriesAndAnnotation[1];
                        var icon = "unknown.jpg";
                        if (annotation.custom && annotation.custom.type) {
                            if (annotation.custom.type.toUpperCase() == "CONFIG") {
                                icon = "config.jpg"
                            }
                            else if (annotation.custom.type.toUpperCase() == "DEPLOYMENT") {
                                icon = "deployment.jpg"
                            }
                            else if (annotation.custom.type.toUpperCase() == "PROBLEM") {
                                icon = "problem.jpg"
                            }
                        }

                        var label = $scope.timeSeriesName(series);
                        var scale = isY1Axis(seriesAndAnnotation[0].aardvark_metric.graphOptions.axis) ? scaleMultiplierByMetricNameY1[seriesAndAnnotation[0].metric] : scaleMultiplierByMetricNameY1[seriesAndAnnotation[0].metric];
                        if (scale > 1) {
                            label = scale+"x "+label;
                        }
                        var baseline = seriesAndAnnotation[2];
                        var offsetMs = 0;
                        if (baseline) {
                            label += "[BL]";
                            offsetMs = $scope.baselineOffset(global, datum).asMilliseconds();
                        }

                        var ret = {
                            series: label,
                            xval: annotation.startTime + offsetMs,
                            height: 16,
                            width: 16,
                            icon: icon,
                            attachAtBottom: true,
                            tickHeight: g.height - 16,
                            text: annotation.description
                        };


                        return ret;
                    }

                    if (dygraphOptions.annotations) {
                        var syncDygraphWithAnnotations = function() {
                            var dygraphAnnotations = [];
                            for (var a=0; a<annotations.length; a++) {
                                dygraphAnnotations.push(createDygraphAnnotation(dygraph, annotations[a]));
                            }
                            $scope.dygraph_setAnnotations(dygraph, dygraphAnnotations);
                        }
                        syncDygraphWithAnnotations();

                        var showAnnotationDialog = function(annotationIndex, point) {
                            var adding = annotationIndex == -1;
                            var seriesAndQueries = {};
                            for (var i=0; i<mainJson.length; i++) {
                                seriesAndQueries[$scope.timeSeriesName(mainJson[i])] = mainJson[i].aardvark_metric;
                            }
                            var modalInstance = $uibModal.open({
                                animation: false,
                                ariaLabelledBy: 'modal-title',
                                ariaDescribedBy: 'modal-body',
                                templateUrl: 'annotationsDialog.tmpl.html',
                                controller: 'AnnotationsDialogCtrl',
                                controllerAs: '$ctrl',
                                size: 'lg',
                                resolve: {
                                    adding: function() {
                                        return adding;
                                    },
                                    originalAnnotation: function() {
                                        return annotationIndex >= 0
                                            ? annotations[annotationIndex][1]
                                            : {
                                            startTime: point.xval
                                        };
                                    },
                                    readOnly: function() {
                                        return annotationIndex >= 0
                                            ? annotations[annotationIndex][2]
                                            : seriesAndQueries[point.name] == null;
                                    },
                                    time: function() {
                                        return point ? point.xval : 0;
                                    },
                                    rootConfig: function() {
                                        return $rootScope.config;
                                    },
                                    seriesAndQueries: function() {
                                        return seriesAndQueries;
                                    },
                                    clickedSeries: function() {
                                        return point ? point.name : null;
                                    },
                                    $tsdbClient: function() {
                                        return $tsdbClient;
                                    },
                                    $tsdbUtils: function() {
                                        return $tsdbUtils;
                                    }
                                }
                            });
                            modalInstance.result.then(function (result) {
                                var action = result.action;
                                var selectedAnnotations = result.annotations;
                                if (action == "add") {
                                    $tsdbClient.bulkSaveAnnotations(selectedAnnotations, function() {
                                        for (var a = 0; a<selectedAnnotations.length; a++) {
                                            var tsuid = selectedAnnotations[a].tsuid;
                                            for (var t=0; t<mainJson.length; t++) {
                                                if (mainJson[t].tsuids.indexOf(tsuid) >= 0) {
                                                    // [json[s], json[s].annotations[a], isBaseline]
                                                    annotations.push([mainJson[t],selectedAnnotations[a],false]);
                                                    // don't break - same tsuid could be present in many visible timeseries
                                                }
                                            }
                                        }
                                        syncDygraphWithAnnotations();
                                    }, function() {
                                        console.log("failed to add annotation(s)");
                                        // todo: errors?
                                    });
                                }
                                else if (action == "edit") {
                                    // use singular endpoint
                                    $tsdbClient.saveAnnotation(selectedAnnotations[0], function() {
                                        annotations[annotationIndex][1] = selectedAnnotations[0];
                                        syncDygraphWithAnnotations();
                                    }, function() {
                                        console.log("failed to save annotation");
                                        // todo: errors?
                                    });

                                }
                                else if (action == "delete") {
                                    // use singular endpoint
                                    $tsdbClient.deleteAnnotation(selectedAnnotations[0], function() {
                                        annotations.splice(annotationIndex, 1);
                                        syncDygraphWithAnnotations();
                                    }, function() {
                                        console.log("failed to delete annotation");
                                        // todo: errors?
                                    });
                                }
                                else {
                                    throw 'Unexpected annotation action: '+action;
                                }
                            }, function () {
                                // do nothing
                            });
                        }

                        if ($rootScope.config.annotations.allowAddEdit) {
                            dygraphPointClickHandler = function(event, p) {
                                if ((!event.ctrlKey && !event.metaKey/*osx*/) || event.button != 0) {
                                    return;
                                }

                                showAnnotationDialog(-1, p);
                            };
                            dygraphAnnotationClickHandler = function(ann, point, dg, event) {
                                var anns = dygraph.annotations();

                                var annIndex = -1;
                                for (var i=0; i<anns.length; i++) {
                                    if (anns[i].xval == ann.xval) {
                                        annIndex = i;
                                    }
                                }

                                if (annIndex == -1) {
                                    return;
                                }

                                showAnnotationDialog(annIndex, null);
                            };
                        }
                    }

                    var yAxisParams = {
                        range:dygraphOptions.y1AxisRange,
                        squashNegative:dygraphOptions.y1SquashNegative,
                        logscale:dygraphOptions.y1Log
                    };
                    var y2AxisParams = {
                        range:dygraphOptions.y2AxisRange,
                        squashNegative:dygraphOptions.y2SquashNegative,
                        logscale:dygraphOptions.y2Log
                    };
                    ret.tsdb_export_link = $scope.tsdbGraphUrl("/#", global, graph, metrics, /*forceAxis*/null, /*downsampleOverrideFn*/null, yAxisParams, y2AxisParams, /*keyParams*/{}, /*lineSmoothing*/false, /*style*/null, dygraphOptions.globalAnnotations);
                    $scope.renderMessages[graph.id] = "";
                    $scope.graphRendered(graph.id);
                    return;

                }

                // 1. make both queries 
                var urls = constructUrls($scope.tsdb_queryString, null);
                var baselineUrls = global.baselining ? constructUrls($scope.tsdb_queryStringForBaseline, datum) : null;

                var expectedNormalResponses = urls.length;
                var receivedNormalResponses = 0;
                var expectedBaselineResponses = global.baselining ? urls.length : 0;
                var receivedBaselineResponses = 0;

                var mainJsons = [];
                var baselineJsons = [];

                var mergeJsons = function(jsons) {
                    var ret = [];
                    for (var j=0; j<jsons.length; j++) {
                        var metricsAndJson = jsons[j];
                        var json = metricsAndJson.response;
                        var metricsByMetric = metricsAndJson.metrics;
                        for (var i=0; i<json.length; i++) {
                            var metric = json[i].metric;
                            json[i].aardvark_metric = metricsByMetric[metric];
                            ret.push(json[i]);
                        }
                    }
                    return ret;
                };

                var doMain = function(metricsAndUrl) {
                    $http.get(metricsAndUrl.url, {withCredentials:$rootScope.config.authenticatedReads}).success(function (json) {
                        if (errorResponse) {
                            return;
                        }
                        mainJsons.push({metrics:metricsAndUrl.metrics, response: json});
                        receivedNormalResponses++;
                        if (expectedNormalResponses == receivedNormalResponses) {
                            //console.log("got all my responses")
                            mainJson = mergeJsons(mainJsons);
                            if (expectedBaselineResponses == receivedBaselineResponses) {
                                processJson();
                            }
                        }
                        // else wait for baseline data
                    }).error(function (arg) {
                            $scope.renderMessages[graph.id] = "Error loading data: "+arg;
                            errorReponse = true;
                            return;
                        });

                }
                var doBaseline = function(metricsAndUrl) {
                    $http.get(metricsAndUrl.url, {withCredentials:$rootScope.config.authenticatedReads}).success(function (json) {
                        if (errorResponse) {
                            return;
                        }
                        baselineJsons.push({metrics:metricsAndUrl.metrics, response: json});
                        receivedBaselineResponses++;
                        if (expectedBaselineResponses == receivedBaselineResponses) {
                            baselineJson = mergeJsons(baselineJsons);
                            if (expectedNormalResponses == receivedNormalResponses) {
                                processJson();
                            }
                        }
                        // else wait for baseline data
                    }).error(function (arg) {
                            $scope.renderMessages[graph.id] = "Error loading data: "+arg;
                            errorReponse = true;
                            return;
                        });

                }

                for (var u=0; u<urls.length; u++) {
                    doMain(urls[u]);
                }

                if (global.baselining) {
                    for (var u=0; u<baselineUrls.length; u++) {
                        doBaseline(baselineUrls[u]);
                    }
                }
            }
            return ret;
        }
    };

    $scope.renderers["scatter"] = {
        create: function() {
            return {
                type: "scatter",
                supports_tsdb_export: false,
                supports_grafana_export: false,
                render: function(global, graph, metrics) {
                    var fromTimestamp = $scope.tsdb_fromTimestampAsTsdbString(global);
                    // validation
                    if (fromTimestamp == null || fromTimestamp == "") {
                        $scope.renderErrors[graph.id] = "No start date specified";
                        return;
                    }
                    if (metrics == null || metrics.length == 0) {
                        $scope.renderErrors[graph.id] = "No metrics specified";
                        return;
                    }
                    if (metrics.length != 2) {
                        $scope.renderErrors[graph.id] = "Require exactly 2 metrics, currently have "+metrics.length;
                        return;
                    }

                    var scatterOptions = graph.scatter;
                    if (!scatterOptions) {
                        scatterOptions = {};
                    }

                    $scope.renderMessages[graph.id] = "Loading...";

                    // url construction
                    var url = $rootScope.config.tsdbBaseReadUrl+"/api/query";

                    url += "?" + $scope.tsdb_queryString(global, graph, metrics);

                    url += "&no_annotations=true&ms=true&show_query=true";

                    // now we have the url, so call it!
                    $http.get(url).success(function (json) {
                        if (json.length != 2) {
                            $scope.renderErrors[graph.id] = "TSDB results doesn't contain exactly 2 metrics, was "+json.length;
                            $scope.renderMessages[graph.id] = "";
                            return;
                        }

                        var xSeries;
                        var ySeries;
                        if (metrics[0].graphOptions.scatter.axis == "y" || metrics[1].graphOptions.scatter.axis == "x") {
                            xSeries = json[1];
                            ySeries = json[0];
                        }
                        else if (metrics[0].graphOptions.scatter.axis == "x" || metrics[1].graphOptions.scatter.axis == "y") {
                            xSeries = json[0];
                            ySeries = json[1];
                        }
                        // by default first metric is x
                        else {
                            xSeries = json[0];
                            ySeries = json[1];
                        }
                        if (scatterOptions.swapAxes) {
                            var tmp = xSeries;
                            xSeries = ySeries;
                            ySeries = tmp;
                        }

                        var timesByValues = {};
                        var data = [];
                        for (var t in xSeries.dps) {
                            if (xSeries.dps.hasOwnProperty(t) && ySeries.dps.hasOwnProperty(t)) {
                                if (scatterOptions.excludeNegative && (xSeries.dps[t] < 0 || ySeries.dps[t] < 0)) {
                                    continue;
                                }
                                var xval = xSeries.dps[t];
                                var yval = ySeries.dps[t];
                                data.push([xval, yval]);
                                var timesKey = xval + "_" + yval;
                                if (!timesByValues.hasOwnProperty(timesKey)) {
                                    timesByValues[timesKey] = [];
                                }
                                timesByValues[timesKey].push(t);
                            }
                        }
                        data.sort(function (a,b) {
                            return a[0] - b[0];
                        });

                        var positionLegend = function() {
                            var graphBoxNode = d3.select("#scatterDiv_"+graph.id).node();
                            // null in unt tests
                            if (graphBoxNode != null) {
                                var graphBox = graphBoxNode.getBoundingClientRect();
                                // top needs to be relative to the whole window
                                var legendTop = graphBox.top;
                                var legendLeft = graphBox.left + 80;
                                // and now we just go find the rule we added and set the top/height
                                d3.select("#scatterLegend_"+graph.id)
                                    .style("top", legendTop+"px")
                                    .style("left", legendLeft+"px");
                            }
                        }

                        positionLegend();

                        var labels = ["x", $scope.timeSeriesName(xSeries) + " (x) vs " + $scope.timeSeriesName(ySeries) + " (y)"];
                        var labelsDiv = document.getElementById("scatterLegend_"+graph.id);

                        var width = Math.floor(graph.graphWidth);
                        var height = Math.floor(graph.graphHeight);
                        var config = {
                            labels: labels,
                            width: width,
                            height: height,
                            legend: "always",
                            drawPoints: true,
                            strokeWidth: 0.0,
                            //                logscale: scatterOptions.ylog,
                            axisLabelFontSize: 9,
                            labelsDivStyles: { fontSize: 9, textAlign: 'right' },
                            labelsSeparateLines: true,
                            labelsDiv: labelsDiv,
                            labelsDivWidth: 1000,
                            axes: {
                                y: {
                                    valueFormatter: function(num, opts, seriesName, g, row, col) {
                                        var xval = g.getValue(row, 0);
                                        var yval = g.getValue(row, 1);
                                        return xval + " vs " + yval;
                                    }
                                },
                                x: {
                                    valueFormatter: function(num, opts, seriesName, g, row, col) {
                                        var xval = g.getValue(row, 0);
                                        var yval = g.getValue(row, 1);
                                        var times = timesByValues[xval+"_"+yval];
                                        var timesText = "";
                                        var sep = "";
                                        for (var t=0; t<times.length; t++) {
                                            try {
                                                timesText += sep + moment.utc(parseInt(times[t])).format("YYYY/MM/DD HH:mm:ss");
                                            }
                                            catch (e) {
                                                timesText += sep + times[t];
                                            }
                                            sep = ", "
                                        }
                                        return timesText;
                                    }
                                }
                            }
                        };

                        $scope.dygraph_render("scatterDiv_"+graph.id, graph.id, data, config);

                        $scope.renderMessages[graph.id] = "";
                        $scope.graphRendered(graph.id);
                        return;
                    })
                        .error(function (arg) {
                            $scope.renderMessages[graph.id] = "Error loading data: "+arg;
                            return;
                        });
                }
            }
        }
    };

    $scope.graphRendered = function (graphId) {
        for (var k in $scope.renderListeners) {
            if ($scope.renderListeners.hasOwnProperty(k)) {
                var fn = $scope.renderListeners[k];
                if (fn != null && typeof fn == "function") {
                    fn(graphId);
                }
            }
        }
    }

    $scope.addGraphRenderListener = function(listenerId, listenerFn) {
        $scope.renderListeners[listenerId] = listenerFn;
    }

    $scope.clearGraphRenderListeners = function() {
        $scope.renderListeners = {};
    }

    $scope.hiddenElement = function (divId) {
        if ($scope.hiddenElements.hasOwnProperty(divId)) {
            return $scope.hiddenElements[divId];
        }
        return false;
    }

    $scope.periodToDiff = function(period) {
        var numberComponent1 = period.match(/^[0-9]+/);
        var stringComponent1 = period.match(/[a-zA-Z]+$/);
        if (numberComponent1.length == 1 && stringComponent1.length == 1) {
            return moment.duration(parseInt(numberComponent1[0]), stringComponent1[0]);
        }
        else {
            return null;
        }
    }
    
    $scope.baselineOffset = function(global, datum) {
        switch (global.baselineDatumStyle) {
            case "from":
                var mainFromDateTime = $scope.tsdb_fromTimestampAsMoment(global, datum);
                var fromDate = moment.utc(global.baselineFromDate, "YYYY/MM/DD");
                var fromTime = moment.utc(global.baselineFromTime, "HH:mm:ss");
                var baselineFromDateTime = moment.utc(fromDate.format("YYYY/MM/DD") + " " + fromTime.format("HH:mm:ss"), "YYYY/MM/DD HH:mm:ss");
                return moment.duration(mainFromDateTime.diff(baselineFromDateTime));
            case "to":
                var mainToDateTime = $scope.tsdb_toTimestampAsMoment(global, datum);
                var toDate = moment.utc(global.baselineToDate, "YYYY/MM/DD");
                var toTime = moment.utc(global.baselineToTime, "HH:mm:ss");
                var baselineToDateTime = moment.utc(toDate.format("YYYY/MM/DD") + " " + toTime.format("HH:mm:ss"), "YYYY/MM/DD HH:mm:ss");
                return moment.duration(mainToDateTime.diff(baselineToDateTime));
            case "relative":
                return $scope.periodToDiff(global.baselineRelativePeriod);
            default:
                throw "Unrecognized baseline datum style: "+global.baselineDatumStyle;
        }
    }

    // helper functions for dealing with tsdb data
    $scope.tsdb_rateString = function(metricOptions) {
        var ret = "rate";
        if (metricOptions.rateCounter) {
            ret += "{counter";
            var rctrSep = ",";
            if (metricOptions.rateCounterMax != null && metricOptions.rateCounterMax != "") {
                ret += "," + metricOptions.rateCounterMax;
            }
            else {
                rctrSep = ",,";
            }
            if (metricOptions.rateCounterReset != null && metricOptions.rateCounterReset != "") {
                ret += rctrSep + metricOptions.rateCounterReset;
            }
            ret += "}";
        }
        return ret;
    }
    
    $scope.tsdb_fromTimestampAsTsdbString = function(global) {
        if (global.absoluteTimeSpecification) {
            var date = moment.utc(global.fromDate, "YYYY/MM/DD");
            var time = moment.utc(global.fromTime, "HH:mm:ss");
            return date.format("YYYY/MM/DD") + " " + time.format("HH:mm:ss");
        }
        else {
            if (global.relativePeriod == null || global.relativePeriod == "") {
                return "";
            }
            return global.relativePeriod+"-ago";
        }
    }
    
    $scope.tsdb_toTimestampAsTsdbString = function(global) {
        if (!global.absoluteTimeSpecification
            || global.toDate == null || global.toDate == ""
            || global.toTime == null || global.toTime == "") {
            return null;
        }
        else {
            var date = moment.utc(global.toDate, "YYYY/MM/DD");
            var time = moment.utc(global.toTime, "HH:mm:ss");
            return date.format("YYYY/MM/DD") + " " + time.format("HH:mm:ss");
        }
    }
    
    $scope.tsdb_fromTimestampAsMoment = function(global, datum) {
        var now = datum ? datum.clone() : moment.utc();
        if (global.absoluteTimeSpecification) {
            var date = moment.utc(global.fromDate, "YYYY/MM/DD");
            var time = moment.utc(global.fromTime, "HH:mm:ss");
            var dateTime = date.format("YYYY/MM/DD") + " " + time.format("HH:mm:ss");
            return moment.utc(dateTime, "YYYY/MM/DD HH:mm:ss");
        }
        else {
            if (global.relativePeriod == null || global.relativePeriod == "") {
                return now;
            }
            var numberComponent = global.relativePeriod.match(/^[0-9]+/);
            var stringComponent = global.relativePeriod.match(/[a-zA-Z]+$/);
            if (numberComponent.length == 1 && stringComponent.length == 1) {
                return now.subtract(numberComponent[0], stringComponent[0]);
            }
            return now;
        }
    }
    
    $scope.tsdb_toTimestampAsMoment = function(global, datum) {
        var now = datum ? datum.clone() : moment.utc();
        if (!global.absoluteTimeSpecification
            || global.toDate == null || global.toDate == ""
            || global.toTime == null || global.toTime == "") {
            return now;
        }
        else {
            var date = moment.utc(global.toDate, "YYYY/MM/DD");
            var time = moment.utc(global.toTime, "HH:mm:ss");
            var dateTime = date.format("YYYY/MM/DD") + " " + time.format("HH:mm:ss");
            return moment.utc(dateTime, "YYYY/MM/DD HH:mm:ss");
        }
    }
    
    $scope.tsdb_baselineFromTimestampAsTsdbString = function(global, datum) {
        switch (global.baselineDatumStyle) {
            case "from":
                var date = moment.utc(global.baselineFromDate, "YYYY/MM/DD");
                var time = moment.utc(global.baselineFromTime, "HH:mm:ss");
                return date.format("YYYY/MM/DD") + " " + time.format("HH:mm:ss");
            case "to":
                var diff;
                if (global.absoluteTimeSpecification) {
                    var mainFromDateTime1 = $scope.tsdb_fromTimestampAsMoment(global, datum);
                    var mainToDateTime1 = $scope.tsdb_toTimestampAsMoment(global, datum);
                    diff = moment.duration(mainToDateTime1.diff(mainFromDateTime1));
                }
                else {
                    diff = $scope.periodToDiff(global.relativePeriod);
                    if (diff == null) {
                        return null;
                    }
                }
                //0, 2d, 2h
                var toDate = moment.utc(global.baselineToDate, "YYYY/MM/DD");
                var toTime = moment.utc(global.baselineToTime, "HH:mm:ss");
                var toDateTimeString = toDate.format("YYYY/MM/DD") + " " + toTime.format("HH:mm:ss");
                var toDateTime = moment.utc(toDateTimeString, "YYYY/MM/DD HH:mm:ss");
                var fromDateTime = toDateTime.subtract(diff);
                return fromDateTime.format("YYYY/MM/DD HH:mm:ss");
            case "relative":
                var mainFromDateTime2 = $scope.tsdb_fromTimestampAsMoment(global, datum);
                var diff1 = $scope.periodToDiff(global.baselineRelativePeriod);
                if (diff1 != null) {
                    var dateTime = mainFromDateTime2.subtract(diff1);
                    return dateTime.format("YYYY/MM/DD HH:mm:ss");
                }
                return null;
        }
    }
    
    $scope.tsdb_baselineToTimestampAsTsdbString = function(global, datum) {
        switch (global.baselineDatumStyle) {
            case "from":
                var diff;
                if (global.absoluteTimeSpecification) {
                    var mainFromDateTime1 = $scope.tsdb_fromTimestampAsMoment(global, datum);
                    var mainToDateTime1 = $scope.tsdb_toTimestampAsMoment(global, datum);
                    diff = moment.duration(mainToDateTime1.diff(mainFromDateTime1));
                }
                else {
                    diff = $scope.periodToDiff(global.relativePeriod);
                    if (diff == null) {
                        return null;
                    }
                }
                var fromDate = moment.utc(global.baselineFromDate, "YYYY/MM/DD");
                var fromTime = moment.utc(global.baselineFromTime, "HH:mm:ss");
                var fromDateTimeString = fromDate.format("YYYY/MM/DD") + " " + fromTime.format("HH:mm:ss");
                var fromDateTime = moment.utc(fromDateTimeString, "YYYY/MM/DD HH:mm:ss");
                var toDateTime = fromDateTime.add(diff);
                return toDateTime.format("YYYY/MM/DD HH:mm:ss");
            case "to":
                var date = moment.utc(global.baselineToDate, "YYYY/MM/DD");
                var time = moment.utc(global.baselineToTime, "HH:mm:ss");
                return date.format("YYYY/MM/DD") + " " + time.format("HH:mm:ss");
            case "relative":
                var mainToDateTime = $scope.tsdb_toTimestampAsMoment(global, datum);
                var diff1 = $scope.periodToDiff(global.baselineRelativePeriod);
                if (diff1 != null) {
                    var dateTime = mainToDateTime.subtract(diff1);
                    return dateTime.format("YYYY/MM/DD HH:mm:ss");
                }
                return null;
        }
    }

    // Helper method for parsing opentsdb's json response
    $scope.cubism_parser = function(json, start, step, stop, interpolate, squashNegatives) {
        // no data
        if (json.length == 0) {
            return [[]];
        }
        return json.map(function (ts) {
            if (ts.dps.length == 0) {
                return [];
            }
            var firstTime = ts.dps[0][0];
            var ret = [];
            for (var v=start; v<firstTime; v+=step) {
                ret.push(null);
            }
            var lastValue;
            var lastValueTime;
            var nextIndex = 0;
            var startFrom = Math.max(firstTime, start);
            for (var v=startFrom; nextIndex<ts.dps.length && v<=stop; v+=step) {
                while (nextIndex < ts.dps.length && ts.dps[nextIndex][0] < v) {
                    nextIndex++;
                }
                if (nextIndex < ts.dps.length) {
                    if (ts.dps[nextIndex][0] == v) {
                        lastValue = ts.dps[nextIndex][1];
                        lastValueTime = ts.dps[nextIndex][0];
                        ret.push(squashNegatives && lastValue < 0 ? 0 : lastValue);
                        nextIndex++;
                        if (nextIndex>=ts.dps.length) {
                            break;
                        }
                    }
                    else if (ts.dps[nextIndex][0] > v) {
                        // interpolate
                        if (interpolate) {
                            var nextValue = ts.dps[nextIndex][1];
                            var nextTime = ts.dps[nextIndex][0];
                            var timeDiffLastToNext = nextTime - lastValueTime;
                            var timeDiffLastToNow = v - lastValueTime;
                            var value = lastValue + ((nextValue - lastValue) * (timeDiffLastToNow / timeDiffLastToNext));
                            ret.push(squashNegatives && value < 0 ? 0 : value);
                        }
                        else {
                            ret.push(null);
                        }
                    }
                }
            }
            return ret;
        });
    };
    
    var my_cubism_id = 0;
    
    $scope.cubism_rule = function(context, leftOffsetContainer) {
        var metric = function(d) { return d; }

        function rule(selection) {
            var id = ++my_cubism_id;

            var line = selection.append("div")
                .datum({id: id})
                .attr("class", "line")
                .call(cubism_ruleStyle);

            selection.each(function(d, i) {
                var that = this,
                    id = ++my_cubism_id,
                    metric_ = typeof metric === "function" ? metric.call(that, d, i) : metric;

                if (!metric_) return;

                function change(start, stop) {
                    var values = [];

                    for (var i = 0, n = context.size(); i < n; ++i) {
                        if (metric_.valueAt(i)) {
                            values.push(i);
                        }
                    }

                    var lines = selection.selectAll(".metric").data(values);
                    lines.exit().remove();
                    lines.enter().append("div").attr("class", "metric line").call(cubism_ruleStyle);
                    lines.style("left", cubism_offsetRuleLeft(offset));
                }

                context.on("change.rule-" + id, change);
                metric_.on("change.rule-" + id, change);
            });

            context.on("focus.rule-" + id, function(i) {
                line.datum(i)
                    .style("display", i == null ? "none" : null)
                    .style("left", i == null ? null : cubism_offsetRuleLeft(leftOffsetContainer));
            });
        }

        rule.remove = function(selection) {

            selection.selectAll(".line")
                .each(remove)
                .remove();

            function remove(d) {
                context.on("focus.rule-" + d.id, null);
            }
        };

        rule.metric = function(_) {
            if (!arguments.length) return metric;
            metric = _;
            return rule;
        };

        return rule;
    };
    
    function cubism_ruleStyle(line) {
        line
            .style("position", "absolute")
            .style("top", 0)
            .style("bottom", 0)
            .style("width", "1px")
            .style("pointer-events", "none");
    }
    
    function cubism_offsetRuleLeft(leftOffsetContainer) {
        return function(i) {
            return (leftOffsetContainer.leftOffset + i) + "px";
        }
    }
    
    function cubism_ruleLeft(i) {
        return i + "px";
    }
    
    $scope.heatmap = function() {

        var ret = {};

        ret._dps = [];
        ret._scale = d3.scale.quantize();
        ret._cellSize = 5;
        ret._width = null;
        ret._height = null;
        ret._colourScheme = "RdYlGn";

        ret._color = function(dps, isFilteredOutFn) {
            var minValue = null, maxValue = null;
            for (var p=0; p<dps.length; p++) {
//                if (dps[p][1] < 0) {
//                    dps[p][1] = 0;
//                }
                if (!isFilteredOutFn(dps[p][1])) {
                    if (minValue == null) {
                        minValue = dps[p][1];
                        maxValue = dps[p][1];
                    }
                    else {
                        minValue = Math.min(minValue, dps[p][1]);
                        maxValue = Math.max(maxValue, dps[p][1]);
                    }
                }
            }

            return ret._scale
                .domain([minValue, maxValue])
                .range(d3.range(11).map(function(d) { return "q" + d + "-11"; }));
        }

        ret.dps = function(_) {
            if (!arguments.length) {
                return ret._dps;
            }
            ret._dps = _;
            return ret;
        };

        ret.scale = function(_) {
            if (!arguments.length) {
                return ret._scale;
            }
            ret._scale = _;
            return ret;
        };

        ret.cellSize = function(_) {
            if (!arguments.length) {
                return ret._cellSize;
            }
            ret._cellSize = _;
            return ret;
        }

        ret.width = function(_) {
            if (!arguments.length) {
                return ret._width;
            }
            ret._width = _;
            return ret;
        }

        ret.height = function(_) {
            if (!arguments.length) {
                return ret._height;
            }
            ret._height = _;
            return ret;
        }

        ret.colourScheme = function(_) {
            if (!arguments.length) {
                return ret._colourScheme;
            }
            ret._colourScheme = _;
            return ret;
        }

        ret.weekDayRender = function(divSelector, fromYear, toYear, isFilteredOutFn) {

            // render away
            var format = d3.time.format("%Y-%m-%d");

            var numYears = (toYear - fromYear) + 1;
            var yearHeight = ret._height / numYears;

            var translateX = ((ret._width - ret._cellSize * 53) / 2);
            if (translateX < 0) {
                translateX = 0;
            }
            var translateY = (yearHeight - ret._cellSize * 7 - 1);
            if (translateY < 0) {
                translateY = 0;
            }

            var color = ret._color(ret._dps, isFilteredOutFn);

            var svg = d3.select(divSelector).selectAll("svg")
                .data(d3.range(fromYear, toYear+1))
                .enter().append("svg")
                .attr("width", ret._width)
                .attr("height", yearHeight)
                .attr("class", ret._colourScheme)
                .append("g")
                .attr("transform", "translate(" + translateX + "," + translateY + ")");

            svg.append("text")
                .attr("transform", "translate(-6," + ret._cellSize * 3.5 + ")rotate(-90)")
                .style("text-anchor", "middle")
                .text(function(d) { return d; });

            var rect = svg.selectAll(".cell")
                .data(function(d) { return d3.time.days(new Date(d, 0, 1), new Date(d + 1, 0, 1)); })
                .enter().append("rect")
                .attr("class", "cell")
                .attr("width", ret._cellSize)
                .attr("height", ret._cellSize)
                .attr("x", function(d) { return d3.time.weekOfYear(d) * ret._cellSize; })
                .attr("y", function(d) { return d.getDay() * ret._cellSize; })
                .datum(format);

            rect.append("title")
                .text(function(d) { return d; });

            svg.selectAll(".path")
                .data(function(d) { return d3.time.months(new Date(d, 0, 1), new Date(d + 1, 0, 1)); })
                .enter().append("path")
                .attr("class", "path")
                .attr("d", monthPath);

            var data = d3.nest()
                .key(function(d) {
                    return format(new Date(d[0]));
                })
                .rollup(function(d) {
                    return d[0][1];
                })
                .map(ret._dps);

            rect.filter(function(d) {
                return d in data;
            })
                .attr("class", function(d) {
                    return "cell " + (isFilteredOutFn(data[d]) ? "filteredOut" : color(data[d]));
                })
                .select("title")
                .text(function(d) {
                    return d + ": " + data[d];
                });

            function monthPath(t0) {
                var t1 = new Date(t0.getFullYear(), t0.getMonth() + 1, 0),
                    d0 = t0.getDay(), w0 = d3.time.weekOfYear(t0),
                    d1 = t1.getDay(), w1 = d3.time.weekOfYear(t1);
                return "M" + (w0 + 1) * ret._cellSize + "," + d0 * ret._cellSize
                    + "H" + w0 * ret._cellSize + "V" + 7 * ret._cellSize
                    + "H" + w1 * ret._cellSize + "V" + (d1 + 1) * ret._cellSize
                    + "H" + (w1 + 1) * ret._cellSize + "V" + 0
                    + "H" + (w0 + 1) * ret._cellSize + "Z";
            }
        }

        ret.dayHourRender = function(divSelector, fromMonth, toMonth, isFilteredOutFn) {

            var color = ret._color(ret._dps, isFilteredOutFn);

            // render away
            var format = d3.time.format("%Y-%m-%d @ %H");

            var monthHeight = ret._cellSize * 25;
            var monthWidth = (ret._cellSize * 31) + 20;

//                console.log("monthWidth = "+monthWidth);
//                console.log("monthHeight = "+monthHeight);

            var svg = d3.select(divSelector).selectAll("svg")
                .data(d3.range(fromMonth, toMonth+1))
                .enter().append("svg")
                .attr("width", monthWidth)
                .attr("height", monthHeight)
                .attr("class", ret._colourScheme)
                .append("g")
                .attr("transform", "translate(19," + (ret._cellSize / 2) + ")");

            svg.append("text")
                .attr("transform", "translate(-6," + ret._cellSize * 12 + ")rotate(-90)")
                .style("text-anchor", "middle")
                .text(function(d) {
                    var month = d%12;
                    var year = (d-month)/12;
                    return (month+1)+"/"+year;
                });

            var rect = svg.selectAll(".cell")
                .data(function(d) {
                    var month1 = d%12;
                    var year1 = (d-month1)/12;
                    var month2 = (d+1)%12;
                    var year2 = ((d+1)-month2)/12;
                    var ret = d3.time.hours(new Date(year1, month1, 1), new Date(year2, month2, 1));
                    return ret;
                })
                .enter().append("rect")
                .attr("class", "cell")
                .attr("width", ret._cellSize)
                .attr("height", ret._cellSize)
                .attr("x", function(d) { return (d.getDate()-1) * ret._cellSize; })
                .attr("y", function(d) { return d.getHours() * ret._cellSize; })
                .datum(format);

            rect.append("title")
                .text(function(d) {
                    return d;
                });

            var data = d3.nest()
                .key(function(d) {
                    return format(new Date(d[0]));
                })
                .rollup(function(d) {
                    return d[0][1];
                })
                .map(ret._dps);

            rect.filter(function(d) {
                return d in data;
            })
                .attr("class", function(d) {
                    return "cell " + (isFilteredOutFn(data[d]) ? "filteredOut" : color(data[d]));
                })
                .select("title")
                .text(function(d) {
                    return d + ": " + data[d];
                });
        }


        return ret;
    }

    $scope.tsdb_queryStringForBaseline = function(global, graph, metrics, perLineFn, datum, downsampleOverrideFn) {
        var fromTimestamp = $scope.tsdb_baselineFromTimestampAsTsdbString(global, datum);
        var toTimestamp = $scope.tsdb_baselineToTimestampAsTsdbString(global, datum);
        return $scope.tsdb_queryStringInternal(fromTimestamp, toTimestamp, global.autoReload, global.globalDownsampling, global.globalDownsampleTo, graph, metrics, perLineFn, downsampleOverrideFn);
    }

    $scope.tsdb_queryString = function(global, graph, metrics, perLineFn, downsampleOverrideFn, noIgnore) {
        var fromTimestamp = $scope.tsdb_fromTimestampAsTsdbString(global);
        var toTimestamp = $scope.tsdb_toTimestampAsTsdbString(global);
        return $scope.tsdb_queryStringInternal(fromTimestamp, toTimestamp, global.autoReload, global.globalDownsampling, global.globalDownsampleTo, graph, metrics, perLineFn, downsampleOverrideFn, noIgnore);
    }

    $scope.tsdb_queryStringInternal = function(fromTimestamp, toTimestamp, autoReload, globalDownsampling, globalDownsampleTo, graph, metrics, perLineFn, downsampleOverrideFn, noIgnore) {
        // validation
        if (fromTimestamp == null || fromTimestamp == "") {
            $scope.renderErrors[graph.id] = "No start date specified";
            return "";
        }
        if (metrics == null || metrics.length == 0) {
            $scope.renderErrors[graph.id] = "No metrics specified";
            return "";
        }

        // url construction
        var url = "";

        url += "start=" + fromTimestamp;
        if (autoReload) {
            url += "&end="+moment.utc().format("YYYY/MM/DD-HH:mm:ss");
        }
        else {
            if (toTimestamp != null) {
                url += "&end=" + toTimestamp;
            }
            else if (!(noIgnore && true)) {
                url += "&ignore="+(++$scope.imageRenderCount);
            }
        }


        for (var i=0; i<metrics.length; i++) {
            // agg:[interval-agg:][rate[{counter[,max[,reset]]}:]metric[{tag=value,...}]
            var metric = metrics[i];
            var options = metric.graphOptions;
            url += "&m=" + options.aggregator + ":";
            if (downsampleOverrideFn) {
                url += downsampleOverrideFn(options.downsampleBy) + ":";
            }
            else if (globalDownsampling) {
                url += globalDownsampleTo + "-" + options.downsampleBy + ":";
            }
            else if (options.downsample) {
                url += options.downsampleTo + "-" + options.downsampleBy + ":";
            }
            if (options.rate) {
                url += $scope.tsdb_rateString(options) + ":";
            }
            else if (options.rateCounter) {
                // todo: warnings should be appended..
                $scope.renderWarnings[graph.id] = "You have specified a rate counter without a rate, ignoring";
            }
            url += metric.name;
            var sep = "{";
            for (var t=0; t<metric.tags.length; t++) {
                var tag = metric.tags[t];
                if (tag.value != "" && (tag.groupBy == null || tag.groupBy)) {
                    url += sep + tag.name + "=" + tag.value;
                    sep = ",";
                }
            }
            if (sep == ",") {
                url += "}";
            }
            // tsdb 2.2+ supports filters
            if ($tsdbClient.versionNumber >= $tsdbClient.TSDB_2_2) {
                // filters section requires the group by section to have been written out, even if empty
                if (sep == ",") {
                    sep = "{";
                }
                else {
                    sep = "{}{";
                }
                for (var t=0; t<metric.tags.length; t++) {
                    var tag = metric.tags[t];
                    if (tag.value != "" && tag.value != "*" && tag.value != "wildcard(*)" && tag.groupBy != null && !tag.groupBy) {
                        url += sep + tag.name + "=" + tag.value;
                        sep = ",";
                    }
                }
                if (sep == ",") {
                    url += "}";
                }
            }

            if (perLineFn) {
                url += perLineFn(metric);
            }

            // ready for next metric
        }

        return url;
    }

    $scope.tsdbGraphUrl = function(path, global, graph, metrics, forceAxis, downsampleOverrideFn, yAxisParams, y2AxisParams, keyParams, lineSmoothing, style, globalAnnotations, addIgnore) {
        if (path == null) {
            // gui
            path = "/#";
        }
        var url = $rootScope.config.tsdbBaseReadUrl+path;
        var qs = $scope.tsdb_queryString(global, graph, metrics, function(metric) {
            if (forceAxis != null) {
                return "&o=axis+"+forceAxis;
            }
            if (metric.graphOptions.axis == null) {
                return "&o=axis+x1y1";
            }
            return "&o=axis+"+metric.graphOptions.axis;
        }, downsampleOverrideFn, !addIgnore);

        if (qs == "") {
            return;
        }

        url += qs;

        var usingLeftAxis = false;
        var usingRightAxis = false;
        for (var i=0; i<metrics.length; i++) {
            if (metrics[i].graphOptions.axis == null || metrics[i].graphOptions.axis == "x1y1" || forceAxis == "x1y1") {
                usingLeftAxis = true;
            }
            else if (metrics[i].graphOptions.axis == "x1y2" || forceAxis == "x1y2") {
                usingRightAxis = true;
            }
            else {
                $scope.renderErrors[graph.id] = "Invalid axis specified";
                return;
            }
        }

        if (usingLeftAxis && yAxisParams != null) {
            if (yAxisParams.label != null) {
                url += "&ylabel=" + $rootScope.formEncode(yAxisParams.label);
            }
            if (yAxisParams.format != null) {
                url += "&yformat=" + $rootScope.formEncode(yAxisParams.format);
            }
            if (yAxisParams.range != null) {
                url += "&yrange=" + $rootScope.formEncode(yAxisParams.range);
            }
            else if (yAxisParams.squashNegative != null && yAxisParams.squashNegative) {
                url += "&yrange=" + $rootScope.formEncode("[0:]");
            }
            if (yAxisParams.logscale != null && yAxisParams.logscale) {
                url += "&ylog";
            }
        }

        if (usingRightAxis && y2AxisParams != null) {
            if (y2AxisParams.label != null) {
                url += "&y2label=" + $rootScope.formEncode(y2AxisParams.label);
            }
            if (y2AxisParams.format != null) {
                url += "&y2format=" + $rootScope.formEncode(y2AxisParams.format);
            }
            if (y2AxisParams.range != null) {
                url += "&y2range=" + $rootScope.formEncode(y2AxisParams.range);
            }
            else if (y2AxisParams.squashNegative != null && y2AxisParams.squashNegative) {
                url += "&y2range=" + $rootScope.formEncode("[0:]");
            }
            if (y2AxisParams.logscale != null && y2AxisParams.logscale) {
                url += "&y2log";
            }
        }

        if (keyParams != null) {
            var keyPos = keyParams.keyLocation;
            if (keyPos == null || keyPos == "") {
                keyPos = "top left";
            }
            if (keyParams.keyAlignment == "horizontal") {
                keyPos += " horiz";
            }
            if (keyParams.keyBox) {
                keyPos += " box";
            }
            url += "&key=" + $rootScope.formEncode(keyPos);
        }
        else {
            url += "&nokey";
        }

        if (lineSmoothing) {
            url += "&smooth=csplines";
        }


        if (style != null) {
            url += "&style="+style;
        }

        if (globalAnnotations) {
            url += "&global_annotations";
        }
        return url;

    }

    $scope.timeSeriesName = function(metric) {
        var name = metric.metric;
        var ungroupedString = "";
        var ungroupedSep = "";
        var tagNames = [];
        if (metric.query != null) {
            // metric.query.tags is deprecated
            if (metric.query.filters != null) {
                var filtersByTagk = {};
                for (var f=0; f<metric.query.filters.length; f++) {
                    if (!filtersByTagk.hasOwnProperty(metric.query.filters[f].tagk)) {
                        filtersByTagk[metric.query.filters[f].tagk] = [];
                    }
                    filtersByTagk[metric.query.filters[f].tagk].push(metric.query.filters[f]);
                }
                // type/tagk/filter/group_by
                for (var tagk in filtersByTagk) {
                    var exclude = false;
                    var groupBy = false;
                    var tagkUngroupedString = "";
                    var tagkUngroupedSep = "";
                    for (var f=0; f<filtersByTagk[tagk].length; f++) {
                        if (filtersByTagk[tagk][f].group_by) {
                            groupBy = true;
                        }
                        tagkUngroupedString += tagkUngroupedSep + tagk + "=" + filtersByTagk[tagk][f].type + "(" + filtersByTagk[tagk][f].filter + ")";
                        tagkUngroupedSep = ",";
                    }
                    if (!groupBy) {
                        exclude = true;
                        ungroupedString += ungroupedSep + tagkUngroupedString;
                        ungroupedSep = ",";
                    }
                    if (!exclude) {
                        tagNames.push(tagk);
                    }
                }
            }
        }
        else {
            for (var tk in metric.tags) {
                if (metric.tags.hasOwnProperty(tk)) {
                    tagNames.push(tk);
                }
            }
        }
        tagNames.sort();
        if (tagNames.length > 0 || ungroupedString != "") {
            name += "{";
            tagNames.sort();
            var sep = "";
            for (var tk = 0; tk < tagNames.length; tk++) {
                name += sep + tagNames[tk] + "=" + metric.tags[tagNames[tk]];
                sep = ",";
            }
            name += "}";
            if (ungroupedString != "") {
                name += "{" + ungroupedString + "}";
            }
        }
        return name;
    }
    
    $scope.dygraph_render = function(divId, graphId, data, config) {
        var div = document.getElementById(divId);
        // dygraph uses these as gospel, unfortunately it also sets them, so making it impossible to change size later
        div.style.width = '';
        div.style.height = '';
        var g = new Dygraph(
            // containing div
            div,
            data,
            config
        );

        $scope.dygraphs[graphId] = g;
        
        return g;
    }
    
    $scope.dygraph_setAnnotations = function(g, annotations) {
        //annotations.sort(function(a,b){return a.xval - b.xval;})
        g.setAnnotations(annotations);
    }
    
    $scope.tsdbExportLink = function(graph) {
        if (graph.type == null) {
            return "";
        }
        if (!$scope.renderedGraphs.hasOwnProperty(graph.id)) {
            return "";
        }
        if (!$scope.renderedGraphs[graph.id].supports_tsdb_export) {
            return "";
        }
        var url = $scope.renderedGraphs[graph.id].tsdb_export_link;
        return url;
    }
    
    $scope.supportsTsdbExport = function(graph) {
        if (graph.type == null) {
            return false;
        }
        if (!$scope.renderedGraphs.hasOwnProperty(graph.id)) {
            return false;
        }
        return $scope.renderedGraphs[graph.id].supports_tsdb_export;
    }
    
    $scope.grafanaExportText = function(graph) {
        if (graph.type == null) {
            return "";
        }
        if (!$scope.renderedGraphs.hasOwnProperty(graph.id)) {
            return "";
        }
        if (!$scope.renderedGraphs[graph.id].supports_grafana_export) {
            return "";
        }
        var url = $scope.renderedGraphs[graph.id].grafana_export_text;
        return url;
    }
    
    $scope.supportsGrafanaExport = function(graph) {
        if (graph.type == null) {
            return false;
        }
        if (!$scope.renderedGraphs.hasOwnProperty(graph.id)) {
            return false;
        }
        return $scope.renderedGraphs[graph.id].supports_grafana_export;
    }

    $rootScope.renderGraphs = function(boundingBox) {
        // set width / height
        var width = 0;
        var height = 0;
        // simple for now - this would have to change if we do dashboarding
        if (boundingBox == null) {
            boundingBox = document.getElementById("graph-content-panel");
        }
        if (boundingBox != null) {
            // extra 20px off in both dirs to account for scroll bars
            width = boundingBox.clientWidth-24;
            height = boundingBox.clientHeight-($rootScope.model.graphs.length*20)-20; // for titles
        }
        var eachHeight = 0;
        if ($rootScope.model.global.autoGraphHeight) {
            eachHeight = height / $rootScope.model.graphs.length;
            var minGraphHeight = $rootScope.model.global.minGraphHeight == "" ? 0 : parseInt($rootScope.model.global.minGraphHeight);
            if (eachHeight < minGraphHeight) {
                eachHeight = minGraphHeight;
            }
        }
        else {
            eachHeight = $rootScope.model.global.graphHeight;
        }
        // not global to allow rendering code to be shared with future dashboards
        for (var i=0; i<$rootScope.model.graphs.length; i++) {
            var graph = $rootScope.model.graphs[i];
            graph.graphWidth = width;
            graph.graphHeight = eachHeight;
        }
        // todo: could be cleverer about clearing in case some graphs haven't changed
        // ie track ids found and delete others
        $scope.clearGraphRenderListeners();
        for (var graphId in $scope.dygraphs) {
            if ($scope.dygraphs.hasOwnProperty(graphId)) {
                $scope.dygraphs[graphId].destroy();
            }
        }
        $scope.dygraphs = {};
        $scope.renderedContent = {};
        $scope.renderErrors = {};
        $scope.renderWarnings = {};
        $scope.renderMessages = {};
        
        var global = $rootScope.model.global || {};
        for (var i=0; i<$rootScope.model.graphs.length; i++) {
            var graph = $rootScope.model.graphs[i];
            var renderer = null;
            // have we already got an instance of the correct renderer for this graph
            if ($scope.renderedGraphs.hasOwnProperty(graph.id) && $scope.renderedGraphs[graph.id].type == graph.type) {
                renderer = $scope.renderedGraphs[graph.id];
            }
            else if (graph.type && $scope.renderers.hasOwnProperty(graph.type)) {
                renderer = $scope.renderers[graph.type].create();
                $scope.renderedGraphs[graph.id] = renderer;
            }
            if (renderer) {
                var metrics = [];
                for (var j=0; j<$rootScope.model.metrics.length; j++) {
                    var metricGraphId = $rootScope.model.metrics[j].graphOptions.graphId;
                    if (metricGraphId==graph.id) {
                        metrics.splice(metrics.length, 0, $rootScope.model.metrics[j]);
                    }
                }
                renderer.render(global, graph, metrics);
            }
        }
    };
    
    $rootScope.onConfigUpdate(function() {
        $rootScope.renderGraphs();
    });
}]);