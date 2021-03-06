'use strict';

describe('Aardvark services', function() {
    
    beforeEach(function () {
        jasmine.addMatchers({
            toEqualData: function(util, customEqualityTesters) {
                return {
                    compare: function(actual, expected) {
                        var passed = angular.equals(actual, expected);
                        return {
                            pass: passed,
                            message: 'Expected ' + JSON.stringify(actual) + '\nto equal ' + JSON.stringify(expected)
                        };
                    }
                };
            }
        });
    });

    beforeEach(module('Aardvark'));

    describe('strings', function () {
    
        it('expects the strings factory to exist', inject(function(strings) {
            expect(strings).toBeDefined();
        }));
        
        it('expects 2 identical strings to best be served by string references', inject(function(strings) {
            var mgr = strings.getWriteManager();
            var r1 = mgr.addString("a.b.c",".");
            var r2 = mgr.addString("a.b.c",".");
            var dict = mgr.complete();
            expect(mgr.state.serialisationMode).toEqualData("stringReferences");
            expect(mgr.state.bytes).toEqualData({
                chains: 9,
                chainReferences: 8,
                stringReferences: 7
            });
            
            expect(r1.resolve()).toEqualData([0]);
            expect(r2.resolve()).toEqualData([0]);
            expect(dict).toEqualData({
                mode: 1,
                strings: ["a.b.c"]
            });
    
            var reader = strings.getReadManager(dict);
            var s1 = reader.getString(r1.resolve(),".");
            var s2 = reader.getString(r2.resolve(),".");
    
            expect(s1).toEqualData("a.b.c");
            expect(s2).toEqualData("a.b.c");
        }));
        
        it('expects 2 different strings with different seperators to best be served by string references', inject(function(strings) {
            var mgr = strings.getWriteManager();
            var r1 = mgr.addString("a.b.c",".");
            var r2 = mgr.addString("f g h"," ");
            var dict = mgr.complete();
            expect(mgr.state.serialisationMode).toEqualData("stringReferences");
            expect(mgr.state.bytes).toEqualData({
                chains: 12,
                chainReferences: 14,
                stringReferences: 12
            });
            
            expect(r1.resolve()).toEqualData([0]);
            expect(r2.resolve()).toEqualData([1]);
            expect(dict).toEqualData({
                mode: 1,
                strings: ["a.b.c", "f g h"]
            });
    
            var reader = strings.getReadManager(dict);
            var s1 = reader.getString(r1.resolve(),".");
            var s2 = reader.getString(r2.resolve()," ");
    
            expect(s1).toEqualData("a.b.c");
            expect(s2).toEqualData("f g h");
        }));
        
        it('expects 2 overlapping strings to best be served by chains', inject(function(strings) {
            var mgr = strings.getWriteManager();
            var r1 = mgr.addString("a.b.c.d",".");
            var r2 = mgr.addString("a.b.d.e",".");
            var dict = mgr.complete();
            expect(mgr.state.serialisationMode).toEqualData("chains");
            expect(mgr.state.bytes).toEqualData({
                chains: 13,
                chainReferences: 15,
                stringReferences: 16
            });
    
            expect(r1.resolve()).toEqualData([0,1,2,3]);
            expect(r2.resolve()).toEqualData([0,1,3,4]);
            expect(dict).toEqualData({
                mode: 2,
                strings: ["a","b","c","d","e"]
            });
    
            var reader = strings.getReadManager(dict);
            var s1 = reader.getString(r1.resolve(),".");
            var s2 = reader.getString(r2.resolve(),".");
    
            expect(s1).toEqualData("a.b.c.d");
            expect(s2).toEqualData("a.b.d.e");
        }));
        
        it('expects 2 pairs of 2 overlapping strings to best be served by chain references', inject(function(strings) {
            var mgr = strings.getWriteManager();
            var r1 = mgr.addString("a.b.c.d",".");
            var r2 = mgr.addString("a.b.c.d",".");
            var r3 = mgr.addString("a.b.d.e",".");
            var r4 = mgr.addString("a.b.d.e",".");
            var dict = mgr.complete();
            expect(mgr.state.serialisationMode).toEqualData("chainReferences");
            expect(mgr.state.bytes).toEqualData({
                chains: 21,
                chainReferences: 17,
                stringReferences: 18
            });
    
            expect(r1.resolve()).toEqualData([0]);
            expect(r2.resolve()).toEqualData([0]);
            expect(r3.resolve()).toEqualData([1]);
            expect(r4.resolve()).toEqualData([1]);
            expect(dict).toEqualData({
                mode: 3,
                strings: ["a","b","c","d","e"],
                references: [{chain:[0,1,2,3]},{chain:[0,1,3,4]}]
            });
            
            var reader = strings.getReadManager(dict);
            var s1 = reader.getString(r1.resolve(),".");
            var s2 = reader.getString(r2.resolve(),".");
            var s3 = reader.getString(r3.resolve(),".");
            var s4 = reader.getString(r4.resolve(),".");
            
            expect(s1).toEqualData("a.b.c.d");
            expect(s2).toEqualData("a.b.c.d");
            expect(s3).toEqualData("a.b.d.e");
            expect(s4).toEqualData("a.b.d.e");
        }));
        
        it('expects compactStringsForWrite to replace all strings with the correct serialised form - raw strings', inject(function(strings) {
            var pathsAndSeps = [
                {path:"prop3.prop5.",sep:"."}
            ];
            var graph = {
                prop1: 1,
                prop2: 2,
                prop3: {
                    prop4: 4,
                    prop5: "string.5"
                }
            };
            strings.compactStringsForWrite(graph, pathsAndSeps);
            expect(graph.prop3.prop5).toEqualData([0]);
            expect(graph.aaStringSerialisedForm).toEqualData({mode:1,strings:["string.5"],references:[]});
        }));
        
        it('expects compactStringsForWrite to replace all strings with the correct serialised form - int arrays', inject(function(strings) {
            var pathsAndSeps = [
                {path:"prop3.prop5a.",sep:"."},
                {path:"prop3.prop5b.",sep:"."}
            ];
            var graph = {
                prop1: 1,
                prop2: 2,
                prop3: {
                    prop4: 4,
                    prop5a: "string.5",
                    prop5b: "string.5"
                }
            };
            strings.compactStringsForWrite(graph, pathsAndSeps);
            expect(graph.prop3.prop5a).toEqualData([0]);
            expect(graph.prop3.prop5b).toEqualData([0]);
            expect(graph.aaStringSerialisedForm).toEqualData({mode:1,strings:["string.5"],references:[]});
        }));
        
        it('captured scenario 1', inject(function(strings) {
            var objectGraph = {"global":{"flags":21,"relativePeriod":null},"graphs":[{"id":1,"type":4,"dygraph":{},"flags":54615}],"queries":[{"id":2,"name":"tsd.rpc.received","tags":[],"flags":85,"graphId":1,"aggregator":null,"scatterAxis":null},{"id":3,"name":"tsd.rpc.errors","tags":[],"flags":85,"graphId":1,"aggregator":null,"scatterAxis":null}]};
            var pathsAndSeps = [{"path":"graphs.title.","sep":" "},{"path":"graphs.gnuplot.yAxisLabel.","sep":" "},{"path":"graphs.gnuplot.y2AxisLabel.","sep":" "},{"path":"graphs.gnuplot.yAxisFormat.","sep":" "},{"path":"graphs.gnuplot.y2AxisFormat.","sep":" "},{"path":"graphs.gnuplot.yAxisRange.","sep":":"},{"path":"graphs.gnuplot.y2AxisRange.","sep":":"},{"path":"queries.name.","sep":"."},{"path":"queries.tags.name.","sep":"."},{"path":"queries.tags.value.","sep":"."}];
            strings.compactStringsForWrite(objectGraph, pathsAndSeps);
        }))
        
        it('expects the read manager to automatically unpack all strings', inject(function(strings) {
            var graph = {
                aaStringSerialisedForm: null,
                prop1: "prop1",
                prop2: {
                    prop3: "prop3",
                    prop4: {
                        prop5: "prop5",
                        prop6: ["prop6a","prop6b"]
                    }
                },
                prop7: [
                    {
                        prop8: "prop8a",
                        prop9: {
                            prop10: "prop10a",
                            prop11: [
                                "prop11a", "prop11b"
                            ]
                        }
                    },
                    {
                        prop8: "prop8b",
                        prop9: {
                            prop10: "prop10b",
                            prop11: [
                                "prop11c", "prop11d"
                            ]
                        }
                    }
                ],
                prop12: [
                    [
                        {
                            prop13: "prop13a",
                            prop14: {
                                prop15: "prop15a"
                            }
                        },
                        {
                            prop13: "prop13b",
                            prop14: {
                                prop15: "prop15b"
                            }
                        }
                    ],
                    [
                        {
                            prop13: "prop13c",
                            prop14: {
                                prop15: "prop15c"
                            }
                        },
                        {
                            prop13: "prop13d",
                            prop14: {
                                prop15: "prop15d"
                            }
                        }
                    ]
                ]
                
            }
            var pathsAndSeps = [
                {path:"prop1.",sep:"."},
                {path:"prop2.prop3.",sep:"."},
                {path:"prop2.prop4.prop5.",sep:"."},
                {path:"prop2.prop4.prop6.",sep:"."},
                {path:"prop7.prop8.",sep:"."},
                {path:"prop7.prop9.prop10.",sep:"."},
                {path:"prop7.prop9.prop11.",sep:"."},
                {path:"prop12.prop13.",sep:"."},
                {path:"prop12.prop14.prop15.",sep:"."}
            ]
            var newModel = JSON.parse(JSON.stringify(graph));
            strings.compactStringsForWrite(newModel, pathsAndSeps);
            strings.getReadManager(newModel.aaStringSerialisedForm).unpackStrings(newModel, pathsAndSeps);
            newModel.aaStringSerialisedForm = null;
            expect(newModel).toEqualData(graph);
        }));
    });
});