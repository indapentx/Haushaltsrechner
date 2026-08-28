export interface MonochromeViolation {
  file: string;
  line: number;
  name: string;
  text: string;
}

export function checkMonochrome(): MonochromeViolation[];
