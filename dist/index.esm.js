import { Observable, combineLatest } from 'rxjs';
import { shareReplay, map, first } from 'rxjs/operators';
import { CollectionReference } from '@firebase/firestore-types';

function flip(arr) {
    return [arr[1], arr[0]];
}
function setPrecsion(km) {
    switch (true) {
        case km <= 0.00477:
            return 9;
        case km <= 0.0382:
            return 8;
        case km <= 0.153:
            return 7;
        case km <= 1.22:
            return 6;
        case km <= 4.89:
            return 5;
        case km <= 39.1:
            return 4;
        case km <= 156:
            return 3;
        case km <= 1250:
            return 2;
        default:
            return 1;
    }
    // 1	≤ 5,000km	×	5,000km
    // 2	≤ 1,250km	×	625km
    // 3	≤ 156km	×	156km
    // 4	≤ 39.1km	×	19.5km
    // 5	≤ 4.89km	×	4.89km
    // 6	≤ 1.22km	×	0.61km
    // 7	≤ 153m	×	153m
    // 8	≤ 38.2m	×	19.1m
    // 9	≤ 4.77m	×	4.77m
}
/////// NGEOHASH ////////
var BASE32_CODES = '0123456789bcdefghjkmnpqrstuvwxyz';
var BASE32_CODES_DICT = {};
for (var i = 0; i < BASE32_CODES.length; i++) {
    BASE32_CODES_DICT[BASE32_CODES.charAt(i)] = i;
}
var ENCODE_AUTO = 'auto';
/**
 * Significant Figure Hash Length
 *
 * This is a quick and dirty lookup to figure out how long our hash
 * should be in order to guarantee a certain amount of trailing
 * significant figures. This was calculated by determining the error:
 * 45/2^(n-1) where n is the number of bits for a latitude or
 * longitude. Key is # of desired sig figs, value is minimum length of
 * the geohash.
 * @type Array
 */
//     Desired sig figs:  0  1  2  3  4   5   6   7   8   9  10
var SIGFIG_HASH_LENGTH = [0, 5, 7, 8, 11, 12, 13, 15, 16, 17, 18];
/**
 * Encode
 *
 * Create a Geohash out of a latitude and longitude that is
 * `numberOfChars` long.
 *
 * @param {Number|String} latitude
 * @param {Number|String} longitude
 * @param {Number} numberOfChars
 * @returns {String}
 */
var encode = function (latitude, longitude, numberOfChars) {
    if (numberOfChars === ENCODE_AUTO) {
        if (typeof latitude === 'number' || typeof longitude === 'number') {
            throw new Error('string notation required for auto precision.');
        }
        var decSigFigsLat = latitude.split('.')[1].length;
        var decSigFigsLong = longitude.split('.')[1].length;
        var numberOfSigFigs = Math.max(decSigFigsLat, decSigFigsLong);
        numberOfChars = SIGFIG_HASH_LENGTH[numberOfSigFigs];
    }
    else if (numberOfChars === undefined) {
        numberOfChars = 9;
    }
    var chars = [], bits = 0, bitsTotal = 0, hash_value = 0, maxLat = 90, minLat = -90, maxLon = 180, minLon = -180, mid;
    while (chars.length < numberOfChars) {
        if (bitsTotal % 2 === 0) {
            mid = (maxLon + minLon) / 2;
            if (longitude > mid) {
                hash_value = (hash_value << 1) + 1;
                minLon = mid;
            }
            else {
                hash_value = (hash_value << 1) + 0;
                maxLon = mid;
            }
        }
        else {
            mid = (maxLat + minLat) / 2;
            if (latitude > mid) {
                hash_value = (hash_value << 1) + 1;
                minLat = mid;
            }
            else {
                hash_value = (hash_value << 1) + 0;
                maxLat = mid;
            }
        }
        bits++;
        bitsTotal++;
        if (bits === 5) {
            var code = BASE32_CODES[hash_value];
            chars.push(code);
            bits = 0;
            hash_value = 0;
        }
    }
    return chars.join('');
};
/**
 * Decode Bounding Box
 *
 * Decode hashString into a bound box matches it. Data returned in a four-element array: [minlat, minlon, maxlat, maxlon]
 * @param {String} hash_string
 * @returns {Array}
 */
var decode_bbox = function (hash_string) {
    var isLon = true, maxLat = 90, minLat = -90, maxLon = 180, minLon = -180, mid;
    var hashValue = 0;
    for (var i = 0, l = hash_string.length; i < l; i++) {
        var code = hash_string[i].toLowerCase();
        hashValue = BASE32_CODES_DICT[code];
        for (var bits = 4; bits >= 0; bits--) {
            var bit = (hashValue >> bits) & 1;
            if (isLon) {
                mid = (maxLon + minLon) / 2;
                if (bit === 1) {
                    minLon = mid;
                }
                else {
                    maxLon = mid;
                }
            }
            else {
                mid = (maxLat + minLat) / 2;
                if (bit === 1) {
                    minLat = mid;
                }
                else {
                    maxLat = mid;
                }
            }
            isLon = !isLon;
        }
    }
    return [minLat, minLon, maxLat, maxLon];
};
/**
 * Decode
 *
 * Decode a hash string into pair of latitude and longitude. A javascript object is returned with keys `latitude`,
 * `longitude` and `error`.
 * @param {String} hashString
 * @returns {Object}
 */
var decode = function (hashString) {
    var bbox = decode_bbox(hashString);
    var lat = (bbox[0] + bbox[2]) / 2;
    var lon = (bbox[1] + bbox[3]) / 2;
    var latErr = bbox[2] - lat;
    var lonErr = bbox[3] - lon;
    return {
        latitude: lat,
        longitude: lon,
        error: { latitude: latErr, longitude: lonErr }
    };
};
/**
 * Neighbors
 *
 * Returns all neighbors' hashstrings clockwise from north around to northwest
 * 7 0 1
 * 6 x 2
 * 5 4 3
 * @param {String} hash_string
 * @returns {encoded neighborHashList|Array}
 */
var neighbors = function (hash_string) {
    var hashstringLength = hash_string.length;
    var lonlat = decode(hash_string);
    var lat = lonlat.latitude;
    var lon = lonlat.longitude;
    var latErr = lonlat.error.latitude * 2;
    var lonErr = lonlat.error.longitude * 2;
    var neighbor_lat, neighbor_lon;
    var neighborHashList = [
        encodeNeighbor(1, 0),
        encodeNeighbor(1, 1),
        encodeNeighbor(0, 1),
        encodeNeighbor(-1, 1),
        encodeNeighbor(-1, 0),
        encodeNeighbor(-1, -1),
        encodeNeighbor(0, -1),
        encodeNeighbor(1, -1)
    ];
    function encodeNeighbor(neighborLatDir, neighborLonDir) {
        neighbor_lat = lat + neighborLatDir * latErr;
        neighbor_lon = lon + neighborLonDir * lonErr;
        return encode(neighbor_lat, neighbor_lon, hashstringLength);
    }
    return neighborHashList;
};

function unwrapExports (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

var helpers = createCommonjsModule(function (module, exports) {
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @module helpers
 */
/**
 * Earth Radius used with the Harvesine formula and approximates using a spherical (non-ellipsoid) Earth.
 *
 * @memberof helpers
 * @type {number}
 */
exports.earthRadius = 6371008.8;
/**
 * Unit of measurement factors using a spherical (non-ellipsoid) earth radius.
 *
 * @memberof helpers
 * @type {Object}
 */
exports.factors = {
    centimeters: exports.earthRadius * 100,
    centimetres: exports.earthRadius * 100,
    degrees: exports.earthRadius / 111325,
    feet: exports.earthRadius * 3.28084,
    inches: exports.earthRadius * 39.370,
    kilometers: exports.earthRadius / 1000,
    kilometres: exports.earthRadius / 1000,
    meters: exports.earthRadius,
    metres: exports.earthRadius,
    miles: exports.earthRadius / 1609.344,
    millimeters: exports.earthRadius * 1000,
    millimetres: exports.earthRadius * 1000,
    nauticalmiles: exports.earthRadius / 1852,
    radians: 1,
    yards: exports.earthRadius / 1.0936,
};
/**
 * Units of measurement factors based on 1 meter.
 *
 * @memberof helpers
 * @type {Object}
 */
exports.unitsFactors = {
    centimeters: 100,
    centimetres: 100,
    degrees: 1 / 111325,
    feet: 3.28084,
    inches: 39.370,
    kilometers: 1 / 1000,
    kilometres: 1 / 1000,
    meters: 1,
    metres: 1,
    miles: 1 / 1609.344,
    millimeters: 1000,
    millimetres: 1000,
    nauticalmiles: 1 / 1852,
    radians: 1 / exports.earthRadius,
    yards: 1 / 1.0936,
};
/**
 * Area of measurement factors based on 1 square meter.
 *
 * @memberof helpers
 * @type {Object}
 */
exports.areaFactors = {
    acres: 0.000247105,
    centimeters: 10000,
    centimetres: 10000,
    feet: 10.763910417,
    inches: 1550.003100006,
    kilometers: 0.000001,
    kilometres: 0.000001,
    meters: 1,
    metres: 1,
    miles: 3.86e-7,
    millimeters: 1000000,
    millimetres: 1000000,
    yards: 1.195990046,
};
/**
 * Wraps a GeoJSON {@link Geometry} in a GeoJSON {@link Feature}.
 *
 * @name feature
 * @param {Geometry} geometry input geometry
 * @param {Object} [properties={}] an Object of key-value pairs to add as properties
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
 * @param {string|number} [options.id] Identifier associated with the Feature
 * @returns {Feature} a GeoJSON Feature
 * @example
 * var geometry = {
 *   "type": "Point",
 *   "coordinates": [110, 50]
 * };
 *
 * var feature = turf.feature(geometry);
 *
 * //=feature
 */
function feature(geom, properties, options) {
    if (options === void 0) { options = {}; }
    var feat = { type: "Feature" };
    if (options.id === 0 || options.id) {
        feat.id = options.id;
    }
    if (options.bbox) {
        feat.bbox = options.bbox;
    }
    feat.properties = properties || {};
    feat.geometry = geom;
    return feat;
}
exports.feature = feature;
/**
 * Creates a GeoJSON {@link Geometry} from a Geometry string type & coordinates.
 * For GeometryCollection type use `helpers.geometryCollection`
 *
 * @name geometry
 * @param {string} type Geometry Type
 * @param {Array<any>} coordinates Coordinates
 * @param {Object} [options={}] Optional Parameters
 * @returns {Geometry} a GeoJSON Geometry
 * @example
 * var type = "Point";
 * var coordinates = [110, 50];
 * var geometry = turf.geometry(type, coordinates);
 * // => geometry
 */
function geometry(type, coordinates, options) {
    if (options === void 0) { options = {}; }
    switch (type) {
        case "Point": return point(coordinates).geometry;
        case "LineString": return lineString(coordinates).geometry;
        case "Polygon": return polygon(coordinates).geometry;
        case "MultiPoint": return multiPoint(coordinates).geometry;
        case "MultiLineString": return multiLineString(coordinates).geometry;
        case "MultiPolygon": return multiPolygon(coordinates).geometry;
        default: throw new Error(type + " is invalid");
    }
}
exports.geometry = geometry;
/**
 * Creates a {@link Point} {@link Feature} from a Position.
 *
 * @name point
 * @param {Array<number>} coordinates longitude, latitude position (each in decimal degrees)
 * @param {Object} [properties={}] an Object of key-value pairs to add as properties
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
 * @param {string|number} [options.id] Identifier associated with the Feature
 * @returns {Feature<Point>} a Point feature
 * @example
 * var point = turf.point([-75.343, 39.984]);
 *
 * //=point
 */
function point(coordinates, properties, options) {
    if (options === void 0) { options = {}; }
    var geom = {
        type: "Point",
        coordinates: coordinates,
    };
    return feature(geom, properties, options);
}
exports.point = point;
/**
 * Creates a {@link Point} {@link FeatureCollection} from an Array of Point coordinates.
 *
 * @name points
 * @param {Array<Array<number>>} coordinates an array of Points
 * @param {Object} [properties={}] Translate these properties to each Feature
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north]
 * associated with the FeatureCollection
 * @param {string|number} [options.id] Identifier associated with the FeatureCollection
 * @returns {FeatureCollection<Point>} Point Feature
 * @example
 * var points = turf.points([
 *   [-75, 39],
 *   [-80, 45],
 *   [-78, 50]
 * ]);
 *
 * //=points
 */
function points(coordinates, properties, options) {
    if (options === void 0) { options = {}; }
    return featureCollection(coordinates.map(function (coords) {
        return point(coords, properties);
    }), options);
}
exports.points = points;
/**
 * Creates a {@link Polygon} {@link Feature} from an Array of LinearRings.
 *
 * @name polygon
 * @param {Array<Array<Array<number>>>} coordinates an array of LinearRings
 * @param {Object} [properties={}] an Object of key-value pairs to add as properties
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
 * @param {string|number} [options.id] Identifier associated with the Feature
 * @returns {Feature<Polygon>} Polygon Feature
 * @example
 * var polygon = turf.polygon([[[-5, 52], [-4, 56], [-2, 51], [-7, 54], [-5, 52]]], { name: 'poly1' });
 *
 * //=polygon
 */
function polygon(coordinates, properties, options) {
    if (options === void 0) { options = {}; }
    for (var _i = 0, coordinates_1 = coordinates; _i < coordinates_1.length; _i++) {
        var ring = coordinates_1[_i];
        if (ring.length < 4) {
            throw new Error("Each LinearRing of a Polygon must have 4 or more Positions.");
        }
        for (var j = 0; j < ring[ring.length - 1].length; j++) {
            // Check if first point of Polygon contains two numbers
            if (ring[ring.length - 1][j] !== ring[0][j]) {
                throw new Error("First and last Position are not equivalent.");
            }
        }
    }
    var geom = {
        type: "Polygon",
        coordinates: coordinates,
    };
    return feature(geom, properties, options);
}
exports.polygon = polygon;
/**
 * Creates a {@link Polygon} {@link FeatureCollection} from an Array of Polygon coordinates.
 *
 * @name polygons
 * @param {Array<Array<Array<Array<number>>>>} coordinates an array of Polygon coordinates
 * @param {Object} [properties={}] an Object of key-value pairs to add as properties
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
 * @param {string|number} [options.id] Identifier associated with the FeatureCollection
 * @returns {FeatureCollection<Polygon>} Polygon FeatureCollection
 * @example
 * var polygons = turf.polygons([
 *   [[[-5, 52], [-4, 56], [-2, 51], [-7, 54], [-5, 52]]],
 *   [[[-15, 42], [-14, 46], [-12, 41], [-17, 44], [-15, 42]]],
 * ]);
 *
 * //=polygons
 */
function polygons(coordinates, properties, options) {
    if (options === void 0) { options = {}; }
    return featureCollection(coordinates.map(function (coords) {
        return polygon(coords, properties);
    }), options);
}
exports.polygons = polygons;
/**
 * Creates a {@link LineString} {@link Feature} from an Array of Positions.
 *
 * @name lineString
 * @param {Array<Array<number>>} coordinates an array of Positions
 * @param {Object} [properties={}] an Object of key-value pairs to add as properties
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
 * @param {string|number} [options.id] Identifier associated with the Feature
 * @returns {Feature<LineString>} LineString Feature
 * @example
 * var linestring1 = turf.lineString([[-24, 63], [-23, 60], [-25, 65], [-20, 69]], {name: 'line 1'});
 * var linestring2 = turf.lineString([[-14, 43], [-13, 40], [-15, 45], [-10, 49]], {name: 'line 2'});
 *
 * //=linestring1
 * //=linestring2
 */
function lineString(coordinates, properties, options) {
    if (options === void 0) { options = {}; }
    if (coordinates.length < 2) {
        throw new Error("coordinates must be an array of two or more positions");
    }
    var geom = {
        type: "LineString",
        coordinates: coordinates,
    };
    return feature(geom, properties, options);
}
exports.lineString = lineString;
/**
 * Creates a {@link LineString} {@link FeatureCollection} from an Array of LineString coordinates.
 *
 * @name lineStrings
 * @param {Array<Array<Array<number>>>} coordinates an array of LinearRings
 * @param {Object} [properties={}] an Object of key-value pairs to add as properties
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north]
 * associated with the FeatureCollection
 * @param {string|number} [options.id] Identifier associated with the FeatureCollection
 * @returns {FeatureCollection<LineString>} LineString FeatureCollection
 * @example
 * var linestrings = turf.lineStrings([
 *   [[-24, 63], [-23, 60], [-25, 65], [-20, 69]],
 *   [[-14, 43], [-13, 40], [-15, 45], [-10, 49]]
 * ]);
 *
 * //=linestrings
 */
function lineStrings(coordinates, properties, options) {
    if (options === void 0) { options = {}; }
    return featureCollection(coordinates.map(function (coords) {
        return lineString(coords, properties);
    }), options);
}
exports.lineStrings = lineStrings;
/**
 * Takes one or more {@link Feature|Features} and creates a {@link FeatureCollection}.
 *
 * @name featureCollection
 * @param {Feature[]} features input features
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
 * @param {string|number} [options.id] Identifier associated with the Feature
 * @returns {FeatureCollection} FeatureCollection of Features
 * @example
 * var locationA = turf.point([-75.343, 39.984], {name: 'Location A'});
 * var locationB = turf.point([-75.833, 39.284], {name: 'Location B'});
 * var locationC = turf.point([-75.534, 39.123], {name: 'Location C'});
 *
 * var collection = turf.featureCollection([
 *   locationA,
 *   locationB,
 *   locationC
 * ]);
 *
 * //=collection
 */
function featureCollection(features, options) {
    if (options === void 0) { options = {}; }
    var fc = { type: "FeatureCollection" };
    if (options.id) {
        fc.id = options.id;
    }
    if (options.bbox) {
        fc.bbox = options.bbox;
    }
    fc.features = features;
    return fc;
}
exports.featureCollection = featureCollection;
/**
 * Creates a {@link Feature<MultiLineString>} based on a
 * coordinate array. Properties can be added optionally.
 *
 * @name multiLineString
 * @param {Array<Array<Array<number>>>} coordinates an array of LineStrings
 * @param {Object} [properties={}] an Object of key-value pairs to add as properties
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
 * @param {string|number} [options.id] Identifier associated with the Feature
 * @returns {Feature<MultiLineString>} a MultiLineString feature
 * @throws {Error} if no coordinates are passed
 * @example
 * var multiLine = turf.multiLineString([[[0,0],[10,10]]]);
 *
 * //=multiLine
 */
function multiLineString(coordinates, properties, options) {
    if (options === void 0) { options = {}; }
    var geom = {
        type: "MultiLineString",
        coordinates: coordinates,
    };
    return feature(geom, properties, options);
}
exports.multiLineString = multiLineString;
/**
 * Creates a {@link Feature<MultiPoint>} based on a
 * coordinate array. Properties can be added optionally.
 *
 * @name multiPoint
 * @param {Array<Array<number>>} coordinates an array of Positions
 * @param {Object} [properties={}] an Object of key-value pairs to add as properties
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
 * @param {string|number} [options.id] Identifier associated with the Feature
 * @returns {Feature<MultiPoint>} a MultiPoint feature
 * @throws {Error} if no coordinates are passed
 * @example
 * var multiPt = turf.multiPoint([[0,0],[10,10]]);
 *
 * //=multiPt
 */
function multiPoint(coordinates, properties, options) {
    if (options === void 0) { options = {}; }
    var geom = {
        type: "MultiPoint",
        coordinates: coordinates,
    };
    return feature(geom, properties, options);
}
exports.multiPoint = multiPoint;
/**
 * Creates a {@link Feature<MultiPolygon>} based on a
 * coordinate array. Properties can be added optionally.
 *
 * @name multiPolygon
 * @param {Array<Array<Array<Array<number>>>>} coordinates an array of Polygons
 * @param {Object} [properties={}] an Object of key-value pairs to add as properties
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
 * @param {string|number} [options.id] Identifier associated with the Feature
 * @returns {Feature<MultiPolygon>} a multipolygon feature
 * @throws {Error} if no coordinates are passed
 * @example
 * var multiPoly = turf.multiPolygon([[[[0,0],[0,10],[10,10],[10,0],[0,0]]]]);
 *
 * //=multiPoly
 *
 */
function multiPolygon(coordinates, properties, options) {
    if (options === void 0) { options = {}; }
    var geom = {
        type: "MultiPolygon",
        coordinates: coordinates,
    };
    return feature(geom, properties, options);
}
exports.multiPolygon = multiPolygon;
/**
 * Creates a {@link Feature<GeometryCollection>} based on a
 * coordinate array. Properties can be added optionally.
 *
 * @name geometryCollection
 * @param {Array<Geometry>} geometries an array of GeoJSON Geometries
 * @param {Object} [properties={}] an Object of key-value pairs to add as properties
 * @param {Object} [options={}] Optional Parameters
 * @param {Array<number>} [options.bbox] Bounding Box Array [west, south, east, north] associated with the Feature
 * @param {string|number} [options.id] Identifier associated with the Feature
 * @returns {Feature<GeometryCollection>} a GeoJSON GeometryCollection Feature
 * @example
 * var pt = turf.geometry("Point", [100, 0]);
 * var line = turf.geometry("LineString", [[101, 0], [102, 1]]);
 * var collection = turf.geometryCollection([pt, line]);
 *
 * // => collection
 */
function geometryCollection(geometries, properties, options) {
    if (options === void 0) { options = {}; }
    var geom = {
        type: "GeometryCollection",
        geometries: geometries,
    };
    return feature(geom, properties, options);
}
exports.geometryCollection = geometryCollection;
/**
 * Round number to precision
 *
 * @param {number} num Number
 * @param {number} [precision=0] Precision
 * @returns {number} rounded number
 * @example
 * turf.round(120.4321)
 * //=120
 *
 * turf.round(120.4321, 2)
 * //=120.43
 */
function round(num, precision) {
    if (precision === void 0) { precision = 0; }
    if (precision && !(precision >= 0)) {
        throw new Error("precision must be a positive number");
    }
    var multiplier = Math.pow(10, precision || 0);
    return Math.round(num * multiplier) / multiplier;
}
exports.round = round;
/**
 * Convert a distance measurement (assuming a spherical Earth) from radians to a more friendly unit.
 * Valid units: miles, nauticalmiles, inches, yards, meters, metres, kilometers, centimeters, feet
 *
 * @name radiansToLength
 * @param {number} radians in radians across the sphere
 * @param {string} [units="kilometers"] can be degrees, radians, miles, or kilometers inches, yards, metres,
 * meters, kilometres, kilometers.
 * @returns {number} distance
 */
function radiansToLength(radians, units) {
    if (units === void 0) { units = "kilometers"; }
    var factor = exports.factors[units];
    if (!factor) {
        throw new Error(units + " units is invalid");
    }
    return radians * factor;
}
exports.radiansToLength = radiansToLength;
/**
 * Convert a distance measurement (assuming a spherical Earth) from a real-world unit into radians
 * Valid units: miles, nauticalmiles, inches, yards, meters, metres, kilometers, centimeters, feet
 *
 * @name lengthToRadians
 * @param {number} distance in real units
 * @param {string} [units="kilometers"] can be degrees, radians, miles, or kilometers inches, yards, metres,
 * meters, kilometres, kilometers.
 * @returns {number} radians
 */
function lengthToRadians(distance, units) {
    if (units === void 0) { units = "kilometers"; }
    var factor = exports.factors[units];
    if (!factor) {
        throw new Error(units + " units is invalid");
    }
    return distance / factor;
}
exports.lengthToRadians = lengthToRadians;
/**
 * Convert a distance measurement (assuming a spherical Earth) from a real-world unit into degrees
 * Valid units: miles, nauticalmiles, inches, yards, meters, metres, centimeters, kilometres, feet
 *
 * @name lengthToDegrees
 * @param {number} distance in real units
 * @param {string} [units="kilometers"] can be degrees, radians, miles, or kilometers inches, yards, metres,
 * meters, kilometres, kilometers.
 * @returns {number} degrees
 */
function lengthToDegrees(distance, units) {
    return radiansToDegrees(lengthToRadians(distance, units));
}
exports.lengthToDegrees = lengthToDegrees;
/**
 * Converts any bearing angle from the north line direction (positive clockwise)
 * and returns an angle between 0-360 degrees (positive clockwise), 0 being the north line
 *
 * @name bearingToAzimuth
 * @param {number} bearing angle, between -180 and +180 degrees
 * @returns {number} angle between 0 and 360 degrees
 */
function bearingToAzimuth(bearing) {
    var angle = bearing % 360;
    if (angle < 0) {
        angle += 360;
    }
    return angle;
}
exports.bearingToAzimuth = bearingToAzimuth;
/**
 * Converts an angle in radians to degrees
 *
 * @name radiansToDegrees
 * @param {number} radians angle in radians
 * @returns {number} degrees between 0 and 360 degrees
 */
function radiansToDegrees(radians) {
    var degrees = radians % (2 * Math.PI);
    return degrees * 180 / Math.PI;
}
exports.radiansToDegrees = radiansToDegrees;
/**
 * Converts an angle in degrees to radians
 *
 * @name degreesToRadians
 * @param {number} degrees angle between 0 and 360 degrees
 * @returns {number} angle in radians
 */
function degreesToRadians(degrees) {
    var radians = degrees % 360;
    return radians * Math.PI / 180;
}
exports.degreesToRadians = degreesToRadians;
/**
 * Converts a length to the requested unit.
 * Valid units: miles, nauticalmiles, inches, yards, meters, metres, kilometers, centimeters, feet
 *
 * @param {number} length to be converted
 * @param {Units} [originalUnit="kilometers"] of the length
 * @param {Units} [finalUnit="kilometers"] returned unit
 * @returns {number} the converted length
 */
function convertLength(length, originalUnit, finalUnit) {
    if (originalUnit === void 0) { originalUnit = "kilometers"; }
    if (finalUnit === void 0) { finalUnit = "kilometers"; }
    if (!(length >= 0)) {
        throw new Error("length must be a positive number");
    }
    return radiansToLength(lengthToRadians(length, originalUnit), finalUnit);
}
exports.convertLength = convertLength;
/**
 * Converts a area to the requested unit.
 * Valid units: kilometers, kilometres, meters, metres, centimetres, millimeters, acres, miles, yards, feet, inches
 * @param {number} area to be converted
 * @param {Units} [originalUnit="meters"] of the distance
 * @param {Units} [finalUnit="kilometers"] returned unit
 * @returns {number} the converted distance
 */
function convertArea(area, originalUnit, finalUnit) {
    if (originalUnit === void 0) { originalUnit = "meters"; }
    if (finalUnit === void 0) { finalUnit = "kilometers"; }
    if (!(area >= 0)) {
        throw new Error("area must be a positive number");
    }
    var startFactor = exports.areaFactors[originalUnit];
    if (!startFactor) {
        throw new Error("invalid original units");
    }
    var finalFactor = exports.areaFactors[finalUnit];
    if (!finalFactor) {
        throw new Error("invalid final units");
    }
    return (area / startFactor) * finalFactor;
}
exports.convertArea = convertArea;
/**
 * isNumber
 *
 * @param {*} num Number to validate
 * @returns {boolean} true/false
 * @example
 * turf.isNumber(123)
 * //=true
 * turf.isNumber('foo')
 * //=false
 */
function isNumber(num) {
    return !isNaN(num) && num !== null && !Array.isArray(num) && !/^\s*$/.test(num);
}
exports.isNumber = isNumber;
/**
 * isObject
 *
 * @param {*} input variable to validate
 * @returns {boolean} true/false
 * @example
 * turf.isObject({elevation: 10})
 * //=true
 * turf.isObject('foo')
 * //=false
 */
function isObject(input) {
    return (!!input) && (input.constructor === Object);
}
exports.isObject = isObject;
/**
 * Validate BBox
 *
 * @private
 * @param {Array<number>} bbox BBox to validate
 * @returns {void}
 * @throws Error if BBox is not valid
 * @example
 * validateBBox([-180, -40, 110, 50])
 * //=OK
 * validateBBox([-180, -40])
 * //=Error
 * validateBBox('Foo')
 * //=Error
 * validateBBox(5)
 * //=Error
 * validateBBox(null)
 * //=Error
 * validateBBox(undefined)
 * //=Error
 */
function validateBBox(bbox) {
    if (!bbox) {
        throw new Error("bbox is required");
    }
    if (!Array.isArray(bbox)) {
        throw new Error("bbox must be an Array");
    }
    if (bbox.length !== 4 && bbox.length !== 6) {
        throw new Error("bbox must be an Array of 4 or 6 numbers");
    }
    bbox.forEach(function (num) {
        if (!isNumber(num)) {
            throw new Error("bbox must only contain numbers");
        }
    });
}
exports.validateBBox = validateBBox;
/**
 * Validate Id
 *
 * @private
 * @param {string|number} id Id to validate
 * @returns {void}
 * @throws Error if Id is not valid
 * @example
 * validateId([-180, -40, 110, 50])
 * //=Error
 * validateId([-180, -40])
 * //=Error
 * validateId('Foo')
 * //=OK
 * validateId(5)
 * //=OK
 * validateId(null)
 * //=Error
 * validateId(undefined)
 * //=Error
 */
function validateId(id) {
    if (!id) {
        throw new Error("id is required");
    }
    if (["string", "number"].indexOf(typeof id) === -1) {
        throw new Error("id must be a number or a string");
    }
}
exports.validateId = validateId;
// Deprecated methods
function radians2degrees() {
    throw new Error("method has been renamed to `radiansToDegrees`");
}
exports.radians2degrees = radians2degrees;
function degrees2radians() {
    throw new Error("method has been renamed to `degreesToRadians`");
}
exports.degrees2radians = degrees2radians;
function distanceToDegrees() {
    throw new Error("method has been renamed to `lengthToDegrees`");
}
exports.distanceToDegrees = distanceToDegrees;
function distanceToRadians() {
    throw new Error("method has been renamed to `lengthToRadians`");
}
exports.distanceToRadians = distanceToRadians;
function radiansToDistance() {
    throw new Error("method has been renamed to `radiansToLength`");
}
exports.radiansToDistance = radiansToDistance;
function bearingToAngle() {
    throw new Error("method has been renamed to `bearingToAzimuth`");
}
exports.bearingToAngle = bearingToAngle;
function convertDistance() {
    throw new Error("method has been renamed to `convertLength`");
}
exports.convertDistance = convertDistance;
});

unwrapExports(helpers);
var helpers_1 = helpers.earthRadius;
var helpers_2 = helpers.factors;
var helpers_3 = helpers.unitsFactors;
var helpers_4 = helpers.areaFactors;
var helpers_5 = helpers.feature;
var helpers_6 = helpers.geometry;
var helpers_7 = helpers.point;
var helpers_8 = helpers.points;
var helpers_9 = helpers.polygon;
var helpers_10 = helpers.polygons;
var helpers_11 = helpers.lineString;
var helpers_12 = helpers.lineStrings;
var helpers_13 = helpers.featureCollection;
var helpers_14 = helpers.multiLineString;
var helpers_15 = helpers.multiPoint;
var helpers_16 = helpers.multiPolygon;
var helpers_17 = helpers.geometryCollection;
var helpers_18 = helpers.round;
var helpers_19 = helpers.radiansToLength;
var helpers_20 = helpers.lengthToRadians;
var helpers_21 = helpers.lengthToDegrees;
var helpers_22 = helpers.bearingToAzimuth;
var helpers_23 = helpers.radiansToDegrees;
var helpers_24 = helpers.degreesToRadians;
var helpers_25 = helpers.convertLength;
var helpers_26 = helpers.convertArea;
var helpers_27 = helpers.isNumber;
var helpers_28 = helpers.isObject;
var helpers_29 = helpers.validateBBox;
var helpers_30 = helpers.validateId;
var helpers_31 = helpers.radians2degrees;
var helpers_32 = helpers.degrees2radians;
var helpers_33 = helpers.distanceToDegrees;
var helpers_34 = helpers.distanceToRadians;
var helpers_35 = helpers.radiansToDistance;
var helpers_36 = helpers.bearingToAngle;
var helpers_37 = helpers.convertDistance;

var invariant = createCommonjsModule(function (module, exports) {
Object.defineProperty(exports, "__esModule", { value: true });

/**
 * Unwrap a coordinate from a Point Feature, Geometry or a single coordinate.
 *
 * @name getCoord
 * @param {Array<number>|Geometry<Point>|Feature<Point>} coord GeoJSON Point or an Array of numbers
 * @returns {Array<number>} coordinates
 * @example
 * var pt = turf.point([10, 10]);
 *
 * var coord = turf.getCoord(pt);
 * //= [10, 10]
 */
function getCoord(coord) {
    if (!coord) {
        throw new Error("coord is required");
    }
    if (!Array.isArray(coord)) {
        if (coord.type === "Feature" && coord.geometry !== null && coord.geometry.type === "Point") {
            return coord.geometry.coordinates;
        }
        if (coord.type === "Point") {
            return coord.coordinates;
        }
    }
    if (Array.isArray(coord) && coord.length >= 2 && !Array.isArray(coord[0]) && !Array.isArray(coord[1])) {
        return coord;
    }
    throw new Error("coord must be GeoJSON Point or an Array of numbers");
}
exports.getCoord = getCoord;
/**
 * Unwrap coordinates from a Feature, Geometry Object or an Array
 *
 * @name getCoords
 * @param {Array<any>|Geometry|Feature} coords Feature, Geometry Object or an Array
 * @returns {Array<any>} coordinates
 * @example
 * var poly = turf.polygon([[[119.32, -8.7], [119.55, -8.69], [119.51, -8.54], [119.32, -8.7]]]);
 *
 * var coords = turf.getCoords(poly);
 * //= [[[119.32, -8.7], [119.55, -8.69], [119.51, -8.54], [119.32, -8.7]]]
 */
function getCoords(coords) {
    if (Array.isArray(coords)) {
        return coords;
    }
    // Feature
    if (coords.type === "Feature") {
        if (coords.geometry !== null) {
            return coords.geometry.coordinates;
        }
    }
    else {
        // Geometry
        if (coords.coordinates) {
            return coords.coordinates;
        }
    }
    throw new Error("coords must be GeoJSON Feature, Geometry Object or an Array");
}
exports.getCoords = getCoords;
/**
 * Checks if coordinates contains a number
 *
 * @name containsNumber
 * @param {Array<any>} coordinates GeoJSON Coordinates
 * @returns {boolean} true if Array contains a number
 */
function containsNumber(coordinates) {
    if (coordinates.length > 1 && helpers.isNumber(coordinates[0]) && helpers.isNumber(coordinates[1])) {
        return true;
    }
    if (Array.isArray(coordinates[0]) && coordinates[0].length) {
        return containsNumber(coordinates[0]);
    }
    throw new Error("coordinates must only contain numbers");
}
exports.containsNumber = containsNumber;
/**
 * Enforce expectations about types of GeoJSON objects for Turf.
 *
 * @name geojsonType
 * @param {GeoJSON} value any GeoJSON object
 * @param {string} type expected GeoJSON type
 * @param {string} name name of calling function
 * @throws {Error} if value is not the expected type.
 */
function geojsonType(value, type, name) {
    if (!type || !name) {
        throw new Error("type and name required");
    }
    if (!value || value.type !== type) {
        throw new Error("Invalid input to " + name + ": must be a " + type + ", given " + value.type);
    }
}
exports.geojsonType = geojsonType;
/**
 * Enforce expectations about types of {@link Feature} inputs for Turf.
 * Internally this uses {@link geojsonType} to judge geometry types.
 *
 * @name featureOf
 * @param {Feature} feature a feature with an expected geometry type
 * @param {string} type expected GeoJSON type
 * @param {string} name name of calling function
 * @throws {Error} error if value is not the expected type.
 */
function featureOf(feature, type, name) {
    if (!feature) {
        throw new Error("No feature passed");
    }
    if (!name) {
        throw new Error(".featureOf() requires a name");
    }
    if (!feature || feature.type !== "Feature" || !feature.geometry) {
        throw new Error("Invalid input to " + name + ", Feature with geometry required");
    }
    if (!feature.geometry || feature.geometry.type !== type) {
        throw new Error("Invalid input to " + name + ": must be a " + type + ", given " + feature.geometry.type);
    }
}
exports.featureOf = featureOf;
/**
 * Enforce expectations about types of {@link FeatureCollection} inputs for Turf.
 * Internally this uses {@link geojsonType} to judge geometry types.
 *
 * @name collectionOf
 * @param {FeatureCollection} featureCollection a FeatureCollection for which features will be judged
 * @param {string} type expected GeoJSON type
 * @param {string} name name of calling function
 * @throws {Error} if value is not the expected type.
 */
function collectionOf(featureCollection, type, name) {
    if (!featureCollection) {
        throw new Error("No featureCollection passed");
    }
    if (!name) {
        throw new Error(".collectionOf() requires a name");
    }
    if (!featureCollection || featureCollection.type !== "FeatureCollection") {
        throw new Error("Invalid input to " + name + ", FeatureCollection required");
    }
    for (var _i = 0, _a = featureCollection.features; _i < _a.length; _i++) {
        var feature = _a[_i];
        if (!feature || feature.type !== "Feature" || !feature.geometry) {
            throw new Error("Invalid input to " + name + ", Feature with geometry required");
        }
        if (!feature.geometry || feature.geometry.type !== type) {
            throw new Error("Invalid input to " + name + ": must be a " + type + ", given " + feature.geometry.type);
        }
    }
}
exports.collectionOf = collectionOf;
/**
 * Get Geometry from Feature or Geometry Object
 *
 * @param {Feature|Geometry} geojson GeoJSON Feature or Geometry Object
 * @returns {Geometry|null} GeoJSON Geometry Object
 * @throws {Error} if geojson is not a Feature or Geometry Object
 * @example
 * var point = {
 *   "type": "Feature",
 *   "properties": {},
 *   "geometry": {
 *     "type": "Point",
 *     "coordinates": [110, 40]
 *   }
 * }
 * var geom = turf.getGeom(point)
 * //={"type": "Point", "coordinates": [110, 40]}
 */
function getGeom(geojson) {
    if (geojson.type === "Feature") {
        return geojson.geometry;
    }
    return geojson;
}
exports.getGeom = getGeom;
/**
 * Get GeoJSON object's type, Geometry type is prioritize.
 *
 * @param {GeoJSON} geojson GeoJSON object
 * @param {string} [name="geojson"] name of the variable to display in error message
 * @returns {string} GeoJSON type
 * @example
 * var point = {
 *   "type": "Feature",
 *   "properties": {},
 *   "geometry": {
 *     "type": "Point",
 *     "coordinates": [110, 40]
 *   }
 * }
 * var geom = turf.getType(point)
 * //="Point"
 */
function getType(geojson, name) {
    if (geojson.type === "FeatureCollection") {
        return "FeatureCollection";
    }
    if (geojson.type === "GeometryCollection") {
        return "GeometryCollection";
    }
    if (geojson.type === "Feature" && geojson.geometry !== null) {
        return geojson.geometry.type;
    }
    return geojson.type;
}
exports.getType = getType;
});

unwrapExports(invariant);
var invariant_1 = invariant.getCoord;
var invariant_2 = invariant.getCoords;
var invariant_3 = invariant.containsNumber;
var invariant_4 = invariant.geojsonType;
var invariant_5 = invariant.featureOf;
var invariant_6 = invariant.collectionOf;
var invariant_7 = invariant.getGeom;
var invariant_8 = invariant.getType;

var C__Users_j0han159_projects_geofirex_node_modules__turf_distance = createCommonjsModule(function (module, exports) {
Object.defineProperty(exports, "__esModule", { value: true });


//http://en.wikipedia.org/wiki/Haversine_formula
//http://www.movable-type.co.uk/scripts/latlong.html
/**
 * Calculates the distance between two {@link Point|points} in degrees, radians, miles, or kilometers.
 * This uses the [Haversine formula](http://en.wikipedia.org/wiki/Haversine_formula) to account for global curvature.
 *
 * @name distance
 * @param {Coord} from origin point
 * @param {Coord} to destination point
 * @param {Object} [options={}] Optional parameters
 * @param {string} [options.units='kilometers'] can be degrees, radians, miles, or kilometers
 * @returns {number} distance between the two points
 * @example
 * var from = turf.point([-75.343, 39.984]);
 * var to = turf.point([-75.534, 39.123]);
 * var options = {units: 'miles'};
 *
 * var distance = turf.distance(from, to, options);
 *
 * //addToMap
 * var addToMap = [from, to];
 * from.properties.distance = distance;
 * to.properties.distance = distance;
 */
function distance(from, to, options) {
    if (options === void 0) { options = {}; }
    var coordinates1 = invariant.getCoord(from);
    var coordinates2 = invariant.getCoord(to);
    var dLat = helpers.degreesToRadians((coordinates2[1] - coordinates1[1]));
    var dLon = helpers.degreesToRadians((coordinates2[0] - coordinates1[0]));
    var lat1 = helpers.degreesToRadians(coordinates1[1]);
    var lat2 = helpers.degreesToRadians(coordinates2[1]);
    var a = Math.pow(Math.sin(dLat / 2), 2) +
        Math.pow(Math.sin(dLon / 2), 2) * Math.cos(lat1) * Math.cos(lat2);
    return helpers.radiansToLength(2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)), options.units);
}
exports.default = distance;
});

var distance = unwrapExports(C__Users_j0han159_projects_geofirex_node_modules__turf_distance);

var bearing_1 = createCommonjsModule(function (module, exports) {
Object.defineProperty(exports, "__esModule", { value: true });


// http://en.wikipedia.org/wiki/Haversine_formula
// http://www.movable-type.co.uk/scripts/latlong.html
/**
 * Takes two {@link Point|points} and finds the geographic bearing between them,
 * i.e. the angle measured in degrees from the north line (0 degrees)
 *
 * @name bearing
 * @param {Coord} start starting Point
 * @param {Coord} end ending Point
 * @param {Object} [options={}] Optional parameters
 * @param {boolean} [options.final=false] calculates the final bearing if true
 * @returns {number} bearing in decimal degrees, between -180 and 180 degrees (positive clockwise)
 * @example
 * var point1 = turf.point([-75.343, 39.984]);
 * var point2 = turf.point([-75.534, 39.123]);
 *
 * var bearing = turf.bearing(point1, point2);
 *
 * //addToMap
 * var addToMap = [point1, point2]
 * point1.properties['marker-color'] = '#f00'
 * point2.properties['marker-color'] = '#0f0'
 * point1.properties.bearing = bearing
 */
function bearing(start, end, options) {
    if (options === void 0) { options = {}; }
    // Reverse calculation
    if (options.final === true) {
        return calculateFinalBearing(start, end);
    }
    var coordinates1 = invariant.getCoord(start);
    var coordinates2 = invariant.getCoord(end);
    var lon1 = helpers.degreesToRadians(coordinates1[0]);
    var lon2 = helpers.degreesToRadians(coordinates2[0]);
    var lat1 = helpers.degreesToRadians(coordinates1[1]);
    var lat2 = helpers.degreesToRadians(coordinates2[1]);
    var a = Math.sin(lon2 - lon1) * Math.cos(lat2);
    var b = Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
    return helpers.radiansToDegrees(Math.atan2(a, b));
}
/**
 * Calculates Final Bearing
 *
 * @private
 * @param {Coord} start starting Point
 * @param {Coord} end ending Point
 * @returns {number} bearing
 */
function calculateFinalBearing(start, end) {
    // Swap start & end
    var bear = bearing(end, start);
    bear = (bear + 180) % 360;
    return bear;
}
exports.default = bearing;
});

var bearing = unwrapExports(bearing_1);

var GeoFirePoint = /** @class */ (function () {
    function GeoFirePoint(app, latitude, longitude) {
        this.app = app;
        this.latitude = latitude;
        this.longitude = longitude;
    }
    GeoFirePoint.neighbors = function (str) {
        return neighbors(str);
    };
    GeoFirePoint.distance = function (to, from) {
        return distance(GeoFirePoint.geoJSON(to), GeoFirePoint.geoJSON(from));
    };
    GeoFirePoint.bearing = function (start, end) {
        return bearing(GeoFirePoint.geoJSON(start), GeoFirePoint.geoJSON(end));
    };
    GeoFirePoint.geoJSON = function (coordinates, props) {
        coordinates = flip(coordinates);
        return {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: coordinates
            },
            properties: props
        };
    };
    Object.defineProperty(GeoFirePoint.prototype, "hash", {
        /**
         * @returns {string} geohash of length 9
         */
        get: function () {
            return encode(this.latitude, this.longitude, 9);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(GeoFirePoint.prototype, "neighbors", {
        /**
         * @returns {string[]} an array of the 8 neigbors of this point's geohash
         */
        get: function () {
            return GeoFirePoint.neighbors(this.hash);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(GeoFirePoint.prototype, "geoJSON", {
        /**
         * @returns {geojson.Feature<geojson.Point>} GeoJSON representation of the point
         */
        get: function () {
            return GeoFirePoint.geoJSON(this.coords);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(GeoFirePoint.prototype, "geoPoint", {
        /**
         * @returns {firestore.GeoPoint} Firestore GeoPoint representation of the point
         */
        get: function () {
            return new this.app.firestore.GeoPoint(this.latitude, this.longitude);
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(GeoFirePoint.prototype, "coords", {
        /**
         * @returns {[Latitude, Longitude]}
         */
        get: function () {
            return [this.latitude, this.longitude];
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(GeoFirePoint.prototype, "data", {
        /**
         * @returns { {geopoint: firestore.GeoPoint, geohash: string} } recommended data format for database
         */
        get: function () {
            return {
                geopoint: this.geoPoint,
                geohash: this.hash
            };
        },
        enumerable: true,
        configurable: true
    });
    /**
     * @param  {number} latitude
     * @param  {number} longitude
     * @returns {number} Haversine distance to another set of coords
     */
    GeoFirePoint.prototype.distance = function (latitude, longitude) {
        return GeoFirePoint.distance(this.coords, [latitude, longitude]);
    };
    /**
     * @param  {number} latitude
     * @param  {number} longitude
     * @returns {number} Haversine bearing to another set of coords
     */
    GeoFirePoint.prototype.bearing = function (latitude, longitude) {
        return GeoFirePoint.bearing(this.coords, [latitude, longitude]);
    };
    return GeoFirePoint;
}());

/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */

var __assign = Object.assign || function __assign(t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
    }
    return t;
};

var defaultOpts = { units: 'km' };
var GeoFireCollectionRef = /** @class */ (function () {
    function GeoFireCollectionRef(app, ref, path, query) {
        this.ref = ref;
        this.path = path;
        if (query)
            this.query = query(this.ref);
        this.setStream();
    }
    GeoFireCollectionRef.fromFirebaseApp = function (app, path, query) {
        return new GeoFireCollectionRef(app, app.firestore().collection(path), path, query);
    };
    GeoFireCollectionRef.fromFireStore = function (app, path, query) {
        return new GeoFireCollectionRef(app, app.collection(path), path, query);
    };
    /**
     * Return the QuerySnapshot as an observable
     * @returns {Observable<firestore.QuerySnapshot>}
     */
    GeoFireCollectionRef.prototype.snapshot = function () {
        return this.stream;
    };
    /**
     * Return the collection mapped to data payload with with ID
     * @param {string} id='id'
     * @returns {Observable<any[]>}
     */
    GeoFireCollectionRef.prototype.data = function (id) {
        if (id === void 0) { id = 'id'; }
        return this.stream.pipe(snapToData(id));
    };
    /**
     * Add a document
     * @param  {any} data
     * @returns {Promise<firestore.DocumentReference>}
     */
    GeoFireCollectionRef.prototype.add = function (data) {
        if (this.ref instanceof CollectionReference) {
            var fbApp = this.ref;
            return fbApp.add(data);
        }
        throw new Error("Add not supported by _firestore.CollectionReference");
        // return this.ref.add(data);
    };
    /**
     * Delete a document in the collection based on the document ID
     * @param  {string} id
     * @returns {Promise<void>}
     */
    GeoFireCollectionRef.prototype.delete = function (id) {
        return this.ref.doc(id).delete();
    };
    /**
     * Create or update a document in the collection based on the document ID
     * @param  {string} id
     * @param  {any} data
     * @returns {Promise<void>}
     */
    GeoFireCollectionRef.prototype.setDoc = function (id, data) {
        return this.ref.doc(id).set(data);
    };
    /**
     * Create or update a document with GeoFirePoint data
     * @param  {string} id document id
     * @param  {string} field name of point on the doc
     * @param  {Latitude} latitude
     * @param  {Longitude} longitude
     * @returns {Promise<void>}
     */
    GeoFireCollectionRef.prototype.setPoint = function (id, field, latitude, longitude) {
        var point = new GeoFirePoint(this.app, latitude, longitude).data;
        return this.ref.doc(id).set((_a = {}, _a[field] = point, _a), { merge: true });
        var _a;
    };
    // TODO remove?
    GeoFireCollectionRef.prototype.changeQuery = function (query) {
        this.query = query(this.ref);
        this.setStream();
    };
    GeoFireCollectionRef.prototype.setStream = function () {
        this.query = this.query || this.ref;
        this.stream = createStream(this.query || this.ref).pipe(shareReplay(1));
    };
    // GEO QUERIES
    /**
     * Queries the Firestore collection based on geograpic radius
     * @param  {GeoFirePoint} center the starting point for the query, i.e gfx.point(lat, lng)
     * @param  {number} radius the radius to search from the centerpoint
     * @param  {string} field the document field that contains the GeoFirePoint data
     * @param  {GeoQueryOptions} opts=defaultOpts
     * @returns {Observable<GeoQueryDocument>} sorted by nearest to farthest
     */
    GeoFireCollectionRef.prototype.within = function (center, radius, field, opts) {
        var _this = this;
        if (opts === void 0) { opts = defaultOpts; }
        var precision = setPrecsion(radius);
        var centerHash = center.hash.substr(0, precision);
        var area = GeoFirePoint.neighbors(centerHash).concat(centerHash);
        var queries = area.map(function (hash) {
            var query = _this.queryPoint(hash, field);
            return createStream(query).pipe(snapToData());
        });
        var docIds = [];
        var combo = combineLatest.apply(void 0, queries).pipe(map(function (arr) {
            var reduced = arr.reduce(function (acc, cur) { return acc.concat(cur); });
            return reduced
                .filter(function (val) {
                var lat = val[field].geopoint.latitude;
                var lng = val[field].geopoint.longitude;
                return center.distance(lat, lng) <= radius * 1.02; // buffer for edge distances;
            })
                .map(function (val) {
                var lat = val[field].geopoint.latitude;
                var lng = val[field].geopoint.longitude;
                var queryMetadata = {
                    distance: center.distance(lat, lng),
                    bearing: center.bearing(lat, lng)
                };
                return __assign({}, val, { queryMetadata: queryMetadata });
            })
                .filter(function (val) {
                if (docIds.indexOf(val) <= 0) {
                    docIds.push(val);
                    return true;
                }
                else {
                    return false;
                }
            })
                .sort(function (a, b) { return a.queryMetadata.distance - b.queryMetadata.distance; });
        }), shareReplay(1));
        return combo;
    };
    GeoFireCollectionRef.prototype.first = function () { };
    GeoFireCollectionRef.prototype.queryPoint = function (geohash, field) {
        var end = geohash + '~';
        return this.query
            .orderBy(field + ".geohash")
            .startAt(geohash)
            .endAt(end);
    };
    return GeoFireCollectionRef;
}());
function snapToData(id) {
    if (id === void 0) { id = 'id'; }
    return map(function (foo) {
        return foo.docs.map(function (v) {
            return __assign({}, (id ? (_a = {}, _a[id] = v.id, _a) : null), v.data());
            var _a;
        });
    });
}
/**
internal, do not use
 */
function createStream(input) {
    return new Observable(function (observer) {
        // Original problematic code:
        // const unsubscribe = input.onSnapshot(observer);
        var unsubscribe = input.onSnapshot(function (val) { return observer.next(val); }, function (err) { return observer.error(err); });
        return { unsubscribe: unsubscribe };
    });
}
/**
 * RxJS operator that converts a collection to a GeoJSON FeatureCollection
 * @param  {string} field the document field that contains the GeoFirePoint
 * @param  {boolean=false} includeProps
 */
function toGeoJSON(field, includeProps) {
    if (includeProps === void 0) { includeProps = false; }
    return map(function (data) {
        return {
            type: 'FeatureCollection',
            features: data.map(function (v) {
                return GeoFirePoint.geoJSON([v[field].geopoint.latitude, v[field].geopoint.longitude], includeProps ? __assign({}, v) : {});
            })
        };
    });
}
/**
 * Helper function to convert any query from an RxJS Observable to a Promise
 * Example usage: await get( collection.within(a, b, c) )
 * @param  {Observable<any>} observable
 * @returns {Promise<any>}
 */
function get(observable) {
    return observable.pipe(first()).toPromise();
}

var GeoFireClient = /** @class */ (function () {
    function GeoFireClient(app) {
        this.app = app;
    }
    /**
     * Creates reference to a Firestore collection that can be used to make geo-queries and perform writes
     * If you pass a query, any subsequent geo-queries will be limited to this subset of documents
     * @param  {string} path path to collection
     * @param  {QueryFn} query? Firestore query id ref => ref.orderBy('foo').limit(5)
     * @returns {GeoFireCollectionRef}
     */
    GeoFireClient.prototype.collection = function (path, query) {
        return GeoFireCollectionRef.fromFirebaseApp(this.app, path, query);
    };
    GeoFireClient.prototype.collectionFromFirestore = function (path, query) {
        return GeoFireCollectionRef.fromFireStore(this.app, path, query);
    };
    /**
     * A GeoFirePoint allows you to create geohashes, format data, and calculate relative distance/bearing.
     * @param  {number} latitude
     * @param  {number} longitude
     * @returns {GeoFirePoint}
     */
    GeoFireClient.prototype.point = function (latitude, longitude) {
        return new GeoFirePoint(this.app, latitude, longitude);
    };
    return GeoFireClient;
}());
/**
 * Initialize the library by passing it your Firebase app
 * @param  {firestore.FirebaseApp} app
 * @returns GeoFireClient
 */
function init(app) {
    return new GeoFireClient(app);
}

export { GeoFirePoint, GeoFireCollectionRef, toGeoJSON, get, GeoFireClient, init };
