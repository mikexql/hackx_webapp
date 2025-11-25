export type Point = { x: number; y: number };

export type MapData = {
  width: number;
  height: number;
  contours: Point[][];
}

export type Evidence = {
  id: string;
  x?: string;
  y?: string;
  time?: string;
  pixel: Point;
  label?: string;
  category?: string;
  notes?: string;
}
