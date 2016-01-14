/**
 * The copyright in this software is being made available under the BSD License,
 * included below. This software may be subject to other third party and contributor
 * rights, including patent rights, and no such rights are granted under this license.
 *
 * Copyright (c) 2013, Dash Industry Forum.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *  * Redistributions of source code must retain the above copyright notice, this
 *  list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above copyright notice,
 *  this list of conditions and the following disclaimer in the documentation and/or
 *  other materials provided with the distribution.
 *  * Neither the name of Dash Industry Forum nor the names of its
 *  contributors may be used to endorse or promote products derived from this software
 *  without specific prior written permission.
 *
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS AS IS AND ANY
 *  EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 *  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 *  IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 *  INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
 *  NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 *  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 *  WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 *  ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 *  POSSIBILITY OF SUCH DAMAGE.
 */
import ErrorHandler from '../streaming/ErrorHandler.js';
import FactoryMaker from '../core/FactoryMaker.js';
import Debug from '../core/Debug.js';

function DashParser(/*config*/) {

    const SECONDS_IN_YEAR = 365 * 24 * 60 * 60;
    const SECONDS_IN_MONTH = 30 * 24 * 60 * 60;
    const SECONDS_IN_DAY = 24 * 60 * 60;
    const SECONDS_IN_HOUR = 60 * 60;
    const SECONDS_IN_MIN = 60;
    const MINUTES_IN_HOUR = 60;
    const MILLISECONDS_IN_SECONDS = 1000;

    let context = this.context;
    let log = Debug(context).getInstance().log;

    let instance,
        durationRegex,
        datetimeRegex,
        numericRegex,
        httpOrHttpsRegex,
        matchers;

    function setup() {

        durationRegex = /^([-])?P(([\d.]*)Y)?(([\d.]*)M)?(([\d.]*)D)?T?(([\d.]*)H)?(([\d.]*)M)?(([\d.]*)S)?/;
        datetimeRegex = /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})(?::([0-9]*)(\.[0-9]*)?)?(?:([+-])([0-9]{2})([0-9]{2}))?/;
        numericRegex = /^[-+]?[0-9]+[.]?[0-9]*([eE][-+]?[0-9]+)?$/;
        httpOrHttpsRegex = /^https?:\/\//i;
        //TODO-Refactor clean this up and move into its own util or somewhere else.
        matchers = [
            {
                type: 'duration',
                test: function (attr) {

                    var attributeList = [
                        'minBufferTime', 'mediaPresentationDuration',
                        'minimumUpdatePeriod', 'timeShiftBufferDepth', 'maxSegmentDuration',
                        'maxSubsegmentDuration', 'suggestedPresentationDelay', 'start',
                        'starttime', 'duration'
                    ];
                    var len = attributeList.length;

                    for (var i = 0; i < len; i++) {
                        if (attr.nodeName === attributeList[i]) {
                            return durationRegex.test(attr.value);
                        }
                    }
                    return false;
                },
                converter: function (str) {
                    //str = "P10Y10M10DT10H10M10.1S";
                    var match = durationRegex.exec(str);
                    var result = (parseFloat(match[2] || 0) * SECONDS_IN_YEAR +
                        parseFloat(match[4] || 0) * SECONDS_IN_MONTH +
                        parseFloat(match[6] || 0) * SECONDS_IN_DAY +
                        parseFloat(match[8] || 0) * SECONDS_IN_HOUR +
                        parseFloat(match[10] || 0) * SECONDS_IN_MIN +
                        parseFloat(match[12] || 0));

                    if (match[1] !== undefined) {
                        result = -result;
                    }

                    return result;
                }
            },
            {
                type: 'datetime',
                test: function (attr) {
                    return datetimeRegex.test(attr.value);
                },
                converter: function (str) {
                    var match = datetimeRegex.exec(str);
                    var utcDate;
                    // If the string does not contain a timezone offset different browsers can interpret it either
                    // as UTC or as a local time so we have to parse the string manually to normalize the given date value for
                    // all browsers
                    utcDate = Date.UTC(
                        parseInt(match[1], 10),
                        parseInt(match[2], 10) - 1, // months start from zero
                        parseInt(match[3], 10),
                        parseInt(match[4], 10),
                        parseInt(match[5], 10),
                        (match[6] && parseInt(match[6], 10) || 0),
                        (match[7] && parseFloat(match[7]) * MILLISECONDS_IN_SECONDS) || 0);
                    // If the date has timezone offset take it into account as well
                    if (match[9] && match[10]) {
                        var timezoneOffset = parseInt(match[9], 10) * MINUTES_IN_HOUR + parseInt(match[10], 10);
                        utcDate += (match[8] === '+' ? -1 : +1) * timezoneOffset * SECONDS_IN_MIN * MILLISECONDS_IN_SECONDS;
                    }

                    return new Date(utcDate);
                }
            },
            {
                type: 'numeric',
                test: function (attr) {
                    return numericRegex.test(attr.value);
                },
                converter: function (str) {
                    return parseFloat(str);
                }
            }
        ];
    }



    function getCommonValuesMap() {
        var adaptationSet,
            representation,
            subRepresentation,
            common;

        common = [
            {
                name: 'profiles',
                merge: false
            },
            {
                name: 'width',
                merge: false
            },
            {
                name: 'height',
                merge: false
            },
            {
                name: 'sar',
                merge: false
            },
            {
                name: 'frameRate',
                merge: false
            },
            {
                name: 'audioSamplingRate',
                merge: false
            },
            {
                name: 'mimeType',
                merge: false
            },
            {
                name: 'segmentProfiles',
                merge: false
            },
            {
                name: 'codecs',
                merge: false
            },
            {
                name: 'maximumSAPPeriod',
                merge: false
            },
            {
                name: 'startsWithSap',
                merge: false
            },
            {
                name: 'maxPlayoutRate',
                merge: false
            },
            {
                name: 'codingDependency',
                merge: false
            },
            {
                name: 'scanType',
                merge: false
            },
            {
                name: 'FramePacking',
                merge: true
            },
            {
                name: 'AudioChannelConfiguration',
                merge: true
            },
            {
                name: 'ContentProtection',
                merge: true
            }
        ];

        adaptationSet = {};
        adaptationSet.name = 'AdaptationSet';
        adaptationSet.isRoot = false;
        adaptationSet.isArray = true;
        adaptationSet.parent = null;
        adaptationSet.children = [];
        adaptationSet.properties = common;

        representation = {};
        representation.name = 'Representation';
        representation.isRoot = false;
        representation.isArray = true;
        representation.parent = adaptationSet;
        representation.children = [];
        representation.properties = common;
        adaptationSet.children.push(representation);

        subRepresentation = {};
        subRepresentation.name = 'SubRepresentation';
        subRepresentation.isRoot = false;
        subRepresentation.isArray = true;
        subRepresentation.parent = representation;
        subRepresentation.children = [];
        subRepresentation.properties = common;
        representation.children.push(subRepresentation);

        return adaptationSet;
    }

    function getSegmentValuesMap() {
        var period,
            adaptationSet,
            representation,
            common;

        common = [
            {
                name: 'SegmentBase',
                merge: true
            },
            {
                name: 'SegmentTemplate',
                merge: true
            },
            {
                name: 'SegmentList',
                merge: true
            }
        ];

        period = {};
        period.name = 'Period';
        period.isRoot = false;
        period.isArray = true;
        period.parent = null;
        period.children = [];
        period.properties = common;

        adaptationSet = {};
        adaptationSet.name = 'AdaptationSet';
        adaptationSet.isRoot = false;
        adaptationSet.isArray = true;
        adaptationSet.parent = period;
        adaptationSet.children = [];
        adaptationSet.properties = common;
        period.children.push(adaptationSet);

        representation = {};
        representation.name = 'Representation';
        representation.isRoot = false;
        representation.isArray = true;
        representation.parent = adaptationSet;
        representation.children = [];
        representation.properties = common;
        adaptationSet.children.push(representation);

        return period;
    }

    function getBaseUrlValuesMap() {
        var mpd,
            period,
            adaptationSet,
            representation,
            common;

        common = [
            {
                name: 'BaseURL',
                merge: true,
                mergeFunction: function (parentValue, childValue) {
                    var mergedValue;

                    // child is absolute, don't merge
                    if (httpOrHttpsRegex.test(childValue)) {
                        mergedValue = childValue;
                    } else {
                        mergedValue = parentValue + childValue;
                    }

                    return mergedValue;
                }
            }
        ];

        mpd = {};
        mpd.name = 'mpd';
        mpd.isRoot = true;
        mpd.isArray = true;
        mpd.parent = null;
        mpd.children = [];
        mpd.properties = common;

        period = {};
        period.name = 'Period';
        period.isRoot = false;
        period.isArray = true;
        period.parent = null;
        period.children = [];
        period.properties = common;
        mpd.children.push(period);

        adaptationSet = {};
        adaptationSet.name = 'AdaptationSet';
        adaptationSet.isRoot = false;
        adaptationSet.isArray = true;
        adaptationSet.parent = period;
        adaptationSet.children = [];
        adaptationSet.properties = common;
        period.children.push(adaptationSet);

        representation = {};
        representation.name = 'Representation';
        representation.isRoot = false;
        representation.isArray = true;
        representation.parent = adaptationSet;
        representation.children = [];
        representation.properties = common;
        adaptationSet.children.push(representation);

        return mpd;
    }

    function getDashMap() {
        var result = [];

        result.push(getCommonValuesMap());
        result.push(getSegmentValuesMap());
        result.push(getBaseUrlValuesMap());

        return result;
    }

    function parse(data, baseUrl, xlinkController) {

        var converter = new X2JS(matchers, '', true);
        var iron = new ObjectIron(getDashMap());
        var start = new Date();

        var manifest;
        var json = null;
        var ironed = null;

        try {
            //log("Converting from XML.");
            manifest = converter.xml_str2json(data);

            if (!manifest) {
                throw 'parser error';
            }

            json = new Date();

            if (!manifest.hasOwnProperty('BaseURL')) {
                //log("Setting baseURL: " + baseUrl);
                manifest.BaseURL = baseUrl;
            } else {
                // Setting manifest's BaseURL to the first BaseURL
                manifest.BaseURL = manifest.BaseURL_asArray[0];

                if (manifest.BaseURL.toString().indexOf('http') !== 0) {
                    manifest.BaseURL = baseUrl + manifest.BaseURL;
                }
            }

            if (manifest.hasOwnProperty('Location')) {
                // for now, do not support multiple Locations -
                // just set Location to the first Location.
                manifest.Location = manifest.Location_asArray[0];
            }

            //log("Flatten manifest properties.");
            iron.run(manifest);
            ironed = new Date();

            xlinkController.setMatchers(matchers);
            xlinkController.setIron(iron);

            log('Parsing complete: ( xml2json: ' + (json.getTime() - start.getTime()) + 'ms, objectiron: ' + (ironed.getTime() - json.getTime()) + 'ms, total: ' + ((ironed.getTime() - start.getTime()) / 1000) + 's)');
        } catch (err) {
            ErrorHandler(context).getInstance().manifestError('parsing the manifest failed', 'parse', data);
            return null;
        }
        return manifest;
    }

    instance = {
        parse: parse
    };

    setup();
    return instance;
}

DashParser.__dashjs_factory_name = 'DashParser';
export default FactoryMaker.getClassFactory(DashParser);