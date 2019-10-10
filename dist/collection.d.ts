import { firestore } from './interfaces';
import * as _firestore from "@google-cloud/firestore";
import { Observable } from 'rxjs';
import { GeoFirePoint, Latitude, Longitude } from './point';
export declare type QueryFn = (ref: firestore.CollectionReference | _firestore.CollectionReference) => firestore.Query;
export interface GeoQueryOptions {
    units: 'km';
}
export interface QueryMetadata {
    bearing: number;
    distance: number;
}
export interface GeoQueryDocument {
    [key: string]: any;
    queryMetadata: QueryMetadata;
}
export declare class GeoFireCollectionRef {
    private ref;
    private path;
    private app;
    private query;
    private stream;
    constructor(app: firestore.FirebaseApp | _firestore.Firestore, ref: firestore.CollectionReference | _firestore.CollectionReference, path: string, query?: QueryFn);
    static fromFirebaseApp(app: firestore.FirebaseApp, path: string, query?: QueryFn): GeoFireCollectionRef;
    static fromFireStore(app: _firestore.Firestore, path: string, query?: QueryFn): GeoFireCollectionRef;
    /**
     * Return the QuerySnapshot as an observable
     * @returns {Observable<firestore.QuerySnapshot>}
     */
    snapshot(): Observable<firestore.QuerySnapshot>;
    /**
     * Return the collection mapped to data payload with with ID
     * @param {string} id='id'
     * @returns {Observable<any[]>}
     */
    data(id?: string): Observable<any[]>;
    /**
     * Add a document
     * @param  {any} data
     * @returns {Promise<firestore.DocumentReference>}
     */
    add(data: any): Promise<firestore.DocumentReference>;
    /**
     * Delete a document in the collection based on the document ID
     * @param  {string} id
     * @returns {Promise<void>}
     */
    delete(id: string): Promise<void> | Promise<_firestore.WriteResult>;
    /**
     * Create or update a document in the collection based on the document ID
     * @param  {string} id
     * @param  {any} data
     * @returns {Promise<void>}
     */
    setDoc(id: string, data: any): Promise<void> | Promise<_firestore.WriteResult>;
    /**
     * Create or update a document with GeoFirePoint data
     * @param  {string} id document id
     * @param  {string} field name of point on the doc
     * @param  {Latitude} latitude
     * @param  {Longitude} longitude
     * @returns {Promise<void>}
     */
    setPoint(id: string, field: string, latitude: Latitude, longitude: Longitude): Promise<void> | Promise<_firestore.WriteResult>;
    changeQuery(query: QueryFn): void;
    private setStream();
    /**
     * Queries the Firestore collection based on geograpic radius
     * @param  {GeoFirePoint} center the starting point for the query, i.e gfx.point(lat, lng)
     * @param  {number} radius the radius to search from the centerpoint
     * @param  {string} field the document field that contains the GeoFirePoint data
     * @param  {GeoQueryOptions} opts=defaultOpts
     * @returns {Observable<GeoQueryDocument>} sorted by nearest to farthest
     */
    within(center: GeoFirePoint, radius: number, field: string, opts?: GeoQueryOptions): Observable<GeoQueryDocument[]>;
    first(): void;
    private queryPoint(geohash, field);
}
/**
 * RxJS operator that converts a collection to a GeoJSON FeatureCollection
 * @param  {string} field the document field that contains the GeoFirePoint
 * @param  {boolean=false} includeProps
 */
export declare function toGeoJSON(field: string, includeProps?: boolean): any;
/**
 * Helper function to convert any query from an RxJS Observable to a Promise
 * Example usage: await get( collection.within(a, b, c) )
 * @param  {Observable<any>} observable
 * @returns {Promise<any>}
 */
export declare function get(observable: Observable<any>): Promise<any>;
