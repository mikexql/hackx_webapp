export interface Point {
    x: number;
    y: number;
}

export interface Evidence {
    id: string;
    x: string;
    y: string;
    time: string;
    pixel: Point;
    label?: string;
    category?: string;
    notes?: string;
}

export interface MapData {
    width: number;
    height: number;
    contours: Point[][];
}