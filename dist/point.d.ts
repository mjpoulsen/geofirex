import { firestore, Point, Feature } from './interfaces';
import * as _firestore from "@google-cloud/firestore";
import * as admin from "firebase-admin";
export declare type Latitude = number;
export declare type Longitude = number;
export declare type Coordinates = [Latitude, Longitude];
export declare class GeoFirePoint {
    app: firestore.FirebaseApp | _firestore.Firestore | admin.app.App;
    latitude: number;
    longitude: number;
    constructor(app: firestore.FirebaseApp | _firestore.Firestore | admin.app.App, latitude: number, longitude: number);
    static neighbors(str: string): string[];
    static distance(to: Coordinates, from: Coordinates): any;
    static bearing(start: Coordinates, end: Coordinates): number;
    static geoJSON(coordinates: Coordinates, props?: any): Feature<Point>;
    /**
     * @returns {string} geohash of length 9
     */
    readonly hash: string;
    /**
     * @returns {string[]} an array of the 8 neigbors of this point's geohash
     */
    readonly neighbors: string[];
    /**
     * @returns {geojson.Feature<geojson.Point>} GeoJSON representation of the point
     */
    readonly geoJSON: Feature<Point>;
    /**
     * @returns {firestore.GeoPoint} Firestore GeoPoint representation of the point
     */
    readonly geoPoint: _firestore.GeoPoint;
    /**
     * @returns {[Latitude, Longitude]}
     */
    readonly coords: Coordinates;
    /**
     * @returns { {geopoint: firestore.GeoPoint, geohash: string} } recommended data format for database
     */
    readonly data: {
        geopoint: _firestore.GeoPoint;
        geohash: string;
    };
    /**
     * @param  {number} latitude
     * @param  {number} longitude
     * @returns {number} Haversine distance to another set of coords
     */
    distance(latitude: number, longitude: number): any;
    /**
     * @param  {number} latitude
     * @param  {number} longitude
     * @returns {number} Haversine bearing to another set of coords
     */
    bearing(latitude: number, longitude: number): number;
}
