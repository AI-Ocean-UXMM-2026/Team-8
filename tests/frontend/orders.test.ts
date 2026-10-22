import test from 'node:test';
import assert from 'node:assert/strict';
import {googleMapsUrl,mapsCoordinates} from '../../src/shared/api/orders';
test('Google Maps links identify a customer marker, never a viewport',()=>{
 assert.deepEqual(mapsCoordinates('https://www.google.com/maps/search/?api=1&query=16.84,96.17'),[16.84,96.17]);
 assert.deepEqual(mapsCoordinates('https://www.google.com/maps/place/Customer/@17,97,12z/data=!3d16.84!4d96.17'),[16.84,96.17]);
 assert.equal(mapsCoordinates('https://www.google.com/maps/@16.84,96.17,12z'),null);
 assert.equal(mapsCoordinates('https://maps.app.goo.gl/abc'),null);
 assert.equal(mapsCoordinates('https://maps.google.com/?q=91,96'),null);
 for(const url of ['https://google.com.evil.test/maps','http://maps.app.goo.gl/x','https://user@maps.app.goo.gl/x','https://www.google.com/search?q=x','https://goo.gl/anything'])assert.equal(googleMapsUrl(url),null);
});
