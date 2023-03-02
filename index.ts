// const express = require('express');
// const bodyParser = require('body-parser')
// const Pool = require('pg').Pool
// const app = express()
// const {} = express
// const port = 3001
//
// app.use(bodyParser.json())
// app.use(
//     bodyParser.urlencoded({
//         extended: true,
//     })
// )
//
// app.get('/', (req:, res: Response) => {
//     console.log(req);
//     console.log(res);
// })
// // const geojsonString  = JSON.stringify(geoJSONData)
// // const insertQuery = `INSERT INTO mypoints (geom, name) VALUES (ST_Multi(ST_GeomFromGeoJSON($1)), $2)`;
// // app.get('/', (req, res) => {

// // })
// // const name = 'shp_1';

// // const values = [name];
// // pool.query(selectQuery, values, (err, res) => {
// //     if (err) {
// //         console.error(err);
// //         return;
// //     }
// //
// //     const features = res.rows.map(row => {

// //     });
// //
// //     const featureCollection = {

// //     };
// //
// //     console.log(featureCollection);
// // });
//
// app.listen(port, () => {
//     console.log(`App running on port ${port}.`)
// })
import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import bodyParser from "body-parser";
import {Pool} from 'pg';
import {GetAllData} from "./index.dto";

dotenv.config();

const app: Express = express();
const port = process.env.PORT;

const pool = new Pool({
    user: process.env.DB_USER!,
    host: process.env.DB_HOST!,
    database: process.env.DB_NAME!,
    password: process.env.DB_PASSWORD!,
    port: parseInt(process.env.DB_PORT!, 10),
})

app.use(bodyParser.json({limit: "50mb"}));
app.use(bodyParser.urlencoded({limit: "50mb", extended: true, parameterLimit:50000}));

app.get('/api', async (req: Request, res: Response) => {
    let result:any = {}
    try {
        const db = await pool.connect();
        const queryResult = await db.query<GetAllData>('SELECT ST_AsGeoJSON(geom)::json, name FROM mypoints;')
        const groupedData: {[x: string]: GetAllData[]} = queryResult.rows.reduce((acc: any, obj) => {
            const key = obj.name;
            if (!acc[key]) {
                acc[key] = [];
            }
            acc[key].push(obj);
            return acc;
        }, {});
        Object.keys(groupedData).forEach((x) => {
            const features = groupedData[x].map((d) => {
                return {
                    "type": "Feature",
                    "geometry": d.st_asgeojson,
                    "properties": {
                        "name": d.name
                    }
                };
            })
            result[x] = {
                "type": "FeatureCollection",
                "features": features
            }
        })
    } catch (e:any) {
        return res.status(500).json({message: e.message})
    }
    return res.status(200).json(result)
});

app.post('/api', async (req: Request, res: Response) => {
    const geojson = req.body.geojson
    const name: string | undefined = req.body.name

    if(!geojson) return res.status(403).json({message: 'geojson field cant be empty'})
    if(!name) return res.status(403).json({message: 'name field cant be empty'})

    const typeRes = geojson
        && geojson.type === 'FeatureCollection'
        && Array.isArray(geojson.features)
        && geojson.features.every((feature: any) => feature.geometry
            && feature.geometry.type
            && Array.isArray(feature.geometry.coordinates));
    if(!typeRes) return res.status(403).json({message: 'geojson is invalid type'})

    const db = await pool.connect();
    try{
        const findByName = await db.query<{name: string}>(`SELECT name from mypoints WHERE name=$1 GROUP BY name`, [name])
        if(findByName.rows.length !== 0 &&
            findByName.rows.filter((x) => x.name === name).length){
            return res.status(403).json({message: 'name already exists'})
        }
    } catch (e:any) {
        return res.status(500).json({message: e.message})
    }

    const query = `INSERT INTO mypoints (geom, name) VALUES (ST_Multi(ST_GeomFromGeoJSON($1)), $2)`;
    try {
        for(const feature of geojson.features){
            await db.query(query, [JSON.stringify(feature.geometry), name])
        }
        await db.query('COMMIT')
    } catch (e: any) {
        await db.query("ROLLBACK");
        return res.status(500).json({message: e.message})
    } finally {
        db.release()
    }
    return res.status(200).json({message: 'success'})
})

app.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
});
