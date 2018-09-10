import { Injectable } from "@angular/core";
import {Observable} from "rxjs";
import {Subject} from "rxjs/Subject";
import * as chroma from "chroma-js";
import proj4 from "proj4";
import * as earcut from "earcut";

@Injectable()
export class CesiumGeomService {
	private dataSource: any;
	// private srftype_ids: any;
 //  private srftype_count: any;
  private parent_ids: string[];
  private total_count: number;
  private prop_ids: any;

  public initialiseCesium(): void {
    this.setDataSource(new Cesium.CustomDataSource());
    this.suspendDataSource();
    this.initialiseSrftypeIds();
  }

	public setDataSource(dataSource: any): void {
    this.dataSource = dataSource;
  }

  public getDataSource(): any {
    return this.dataSource;
  }

  public clearDataSource(): void {
    this.dataSource = null;
  }

  public suspendDataSource(): void {
    this.dataSource.entities.suspendEvents();
  }

  public resumeDataSource(): void {
    this.dataSource.entities.resumeEvents();
  }

  public initialiseSrftypeIds(): void {
    // this.srftype_ids = {};
    // this.srftype_count = {};
    this.parent_ids = [];
    this.total_count = 0;
    this.prop_ids = {};
  }

  public getIds(): any {
    // return this.srftype_ids;
    return this.parent_ids;
  }

  public getCount(): any {
    // return this.srftype_count;
    return this.total_count;
  }

  public getPropIds(): any {
    return this.prop_ids;
  }

  // private addSrfTypeId(srf_type,id,count) {
  //   // if srftype doesn't exist in array, add it
  //   if (this.srftype_ids[srf_type] === undefined) {
  //     this.srftype_ids[srf_type] = [id];
  //     this.srftype_count[srf_type] = count;
  //   }
  //   // if it already exists then push id to existing arr
  //   else {
  //     this.srftype_ids[srf_type].push(id);
  //     this.srftype_count[srf_type] += count;
  //   }
  // }

  private addId(srf_type,id,count) {
    // if srftype doesn't exist in array, add it
  //   if (this.srftype_ids[srf_type] === undefined) {
  //     this.srftype_ids[srf_type] = [id];
  //     this.srftype_count[srf_type] = count;
  //   }
  //   // if it already exists then push id to existing arr
  //   else {
  //     this.srftype_ids[srf_type].push(id);
  //     this.srftype_count[srf_type] += count;
  //   }
    this.parent_ids.push(id);
    this.total_count += count;
  }

  private addPropId(props) {
    // if PropId doesn't exist in array, add it
    const ids = Object.keys(props);
    for (let i of ids) {
      if (this.prop_ids[i] === undefined) {
        this.prop_ids[i] = [props[i]];
      }
      // if it already exists then push id to existing arr
      else {
        if (this.prop_ids[i].includes(props[i]) === false) {
          this.prop_ids[i].push(props[i]);
        }
      }
    }
  }

  public timeIntervalColor(color): any {
    var property = new Cesium.TimeIntervalCollectionProperty(Cesium.Color);
    var timeInterval = new Cesium.TimeInterval({
        start : Cesium.JulianDate.fromDate(new Date(1000, 1, 1, 1)),
        stop : Cesium.JulianDate.fromDate(new Date(3000, 1, 1, 1)),
        isStartIncluded : true,
        isStopIncluded : false,
        data : color
    });
    property.intervals.addInterval(timeInterval);
    return new Cesium.ColorMaterialProperty(property);
  }

  public maxDiff(values): number {
    let maxval = values[0];
    let minval = values[0];
    for (let i = 1 ; i < values.length ; i++) {
      if (values[i] > maxval) {
        maxval = values[i];
      }
      if (values[i] < minval) {
        minval = values[i];
      }
    }
    return (maxval - minval);
  }

  public determineAxis(points): number {
    // split coords and determine plane
    const x = [];
    const y = [];
    points.forEach((coords) => {
      x.push(coords[0]);
      y.push(coords[1]);
    });

    if (this.maxDiff(x) > this.maxDiff(y)) {
      // x axis seems to be wider, use xz axis
      return 0;
    } else {
      // y axis seems to be wider, use yz axis
      return 1;
    }
  }

  public checkHorizontal(ring): boolean {
    //Check horizontal or not
    const z = [];
    ring.forEach((coords) => {
      z.push(coords[2]);
    });

    if (this.maxDiff(z) < 0.001) {
      return true;
    } else {
      return false;
    }
  }

  public flatCoords(ring): number[] {
    const flat = [];
    ring.forEach((point) => {
      flat.push(...point);
    });
    return flat;
  }

  public determineColor(surface_type): any {
    let colour = undefined;
    if (surface_type === "WallSurface") {
      colour = this.timeIntervalColor(Cesium.Color.SILVER);
    } else if (surface_type === "RoofSurface") {
      colour = this.timeIntervalColor(Cesium.Color.RED);
    } else if (surface_type === "Window") {
      colour = this.timeIntervalColor(Cesium.Color.LIGHTBLUE.withAlpha(0.5));
    } else if (surface_type === "Door") {
      colour = this.timeIntervalColor(Cesium.Color.TAN);
    } else {
      colour = this.timeIntervalColor(Cesium.Color.WHITE);
    }
    return colour;
  }

  public addCesiumPoly(polygon, colour, parent): void {
    // Create polygon heirarchy
    const ext = Cesium.Cartesian3.fromDegreesArrayHeights(this.flatCoords(polygon[0]));
    let p_hierarchy = new Cesium.PolygonHierarchy(ext);
    if (polygon.length > 0) {
      const int = [];
      for (let i = 1 ; i < polygon.length ; i++) {
        int.push(new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArrayHeights(this.flatCoords(polygon[i]))));
      }
      p_hierarchy = new Cesium.PolygonHierarchy(ext,int);
    }

    // Create polygon
    const poly = this.dataSource.entities.add({
      parent : parent,
      polygon : {
        hierarchy : p_hierarchy,
        perPositionHeight : true,
        material : colour,
        outline : false,
      },
    });
  }

  public addTriPoly(polygon, colour, parent): void {
    // Determine if triangulation should be done on XZ or YZ plane (if X or Y axis have a larger range of values)
    // 0 for XZ, 1 for YZ
    const axis = this.determineAxis(polygon[0]);
    let other_axis = 0;
    if (axis === 0) {
      other_axis = 1;
    }

    // Get points from respective axes and put into earcut format
    const poly_vertices = [];
    const holes = [];
    const other_coords = [];
    let count = 0;
    for (let i = 0 ; i < polygon.length ; i++) {
      polygon[i].forEach((coords) => {
        poly_vertices.push(coords[axis],coords[2]);
        other_coords.push(coords[other_axis]);
        count++;
      });
      if (i !== (polygon.length - 1)) {
        holes.push(count);
      }
    }

    // Throw into earcut
    const tri_index = earcut(poly_vertices,holes);

    // Create polys in Cesium
    for (let p = 0 ; p < tri_index.length ; p = p + 3) {
      const points = [];

      // Get coordinates for each point
      [tri_index[p], tri_index[p+1], tri_index[p+2]].forEach((j) => {
        let coord = [undefined,undefined,undefined];
        coord[other_axis] = other_coords[j];
        coord[axis] = poly_vertices[j*2];
        coord[2] = poly_vertices[(j*2) + 1];
        points.push(coord);
      });
      this.addCesiumPoly([points], colour, parent);
    }
  }

  public genMultiPoly(polygon, colour, properties): void {
    // Create parent to hold polygon
    const parent = this.dataSource.entities.add(new Cesium.Entity());
    let CScolour = undefined;
    if (colour !== undefined) {
      CScolour = this.timeIntervalColor(colour);
    } else {
      CScolour = this.determineColor(properties["Surface_Type"]);
    }
    // If horizontal use Cesium Polygon Entity API directly
    if (this.checkHorizontal(polygon[0]) === true) {
      this.addCesiumPoly(polygon, CScolour, parent);
    }
    // If not, triangulate with earcut into individual entities
    else {
      this.addTriPoly(polygon, CScolour, parent);
    }
    // Add properties and add entity ID to respective group for filter
    parent.properties = new Cesium.PropertyBag(properties);
    this.addId(properties["Surface_Type"],parent.id,parent._children.length);
    this.addPropId(properties);
  }

  public genSolid(solid, colour, surface_type, properties): void {
    for (var i = 0 ; i < solid.length ; i++) {
      // Create parent to hold polygons
      const parent = this.dataSource.entities.add(new Cesium.Entity());
      const polygon = solid[i];
      let CScolour = undefined;
      if (colour[i] !== undefined) {
        CScolour = this.timeIntervalColor(colour[i]);
      } else {
        CScolour = this.determineColor(surface_type[i]);
      }
      // Edit properties
      properties.Surface_Type = surface_type[i];
      // If horizontal use Cesium Polygon Entity API directly
      if (this.checkHorizontal(polygon[0]) === true) {
        this.addCesiumPoly(polygon, CScolour, parent);
      }
      // If not, triangulate with earcut into individual entities
      else {
        this.addTriPoly(polygon, CScolour, parent);
      }
      // Add properties and add entity ID to respective group for filter
      parent.properties = new Cesium.PropertyBag(properties);
      this.addId(properties["Surface_Type"],parent.id,parent._children.length);
      this.addPropId(properties);
    }
  }

  public genSolidGrouped(solid, colour, properties): void {
    // Create parent to hold polygons
    const parent = this.dataSource.entities.add(new Cesium.Entity());
    let CScolour = undefined;
    if (colour !== undefined) {
      CScolour = this.timeIntervalColor(colour);
    } else {
      CScolour = this.determineColor(properties["Surface_Type"]);
    }
    for (var i = 0 ; i < solid.length ; i++) {
      const polygon = solid[i];
      // If horizontal use Cesium Polygon Entity API directly
      if (this.checkHorizontal(polygon[0]) === true) {
        this.addCesiumPoly(polygon, CScolour, parent);
      }
      // If not, triangulate with earcut into individual entities
      else {
        this.addTriPoly(polygon, CScolour, parent);
      }
    }
    // Add properties and add entity ID to respective group for filter
    parent.properties = new Cesium.PropertyBag(properties);
    this.addId(properties["Surface_Type"],parent.id,parent._children.length);
    this.addPropId(properties);
  }
}