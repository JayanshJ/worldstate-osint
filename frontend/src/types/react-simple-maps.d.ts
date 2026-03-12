declare module 'react-simple-maps' {
  import { ComponentType, ReactNode, SVGProps } from 'react'

  export interface ProjectionConfig {
    scale?:      number
    center?:     [number, number]
    rotate?:     [number, number, number]
    parallels?:  [number, number]
  }

  export interface ComposableMapProps extends SVGProps<SVGSVGElement> {
    projection?:       string
    projectionConfig?: ProjectionConfig
    width?:            number
    height?:           number
    style?:            React.CSSProperties
    children?:         ReactNode
  }

  export interface ZoomableGroupProps {
    zoom?:        number
    center?:      [number, number]
    translateExtent?: [[number, number], [number, number]]
    onMoveStart?: (pos: { coordinates: [number, number]; zoom: number }) => void
    onMove?:      (pos: { x: number; y: number; zoom: number; dragging: boolean }) => void
    onMoveEnd?:   (pos: { coordinates: [number, number]; zoom: number }) => void
    children?:    ReactNode
  }

  export interface GeographiesProps {
    geography:   string | object
    children:    (args: { geographies: Geography[] }) => ReactNode
    parseGeographies?: (f: unknown[]) => unknown[]
  }

  export interface Geography {
    rsmKey:     string
    properties: Record<string, string | number>
    geometry:   object
    type:       string
  }

  export interface GeographyStyle {
    fill?:        string
    stroke?:      string
    strokeWidth?: number
    outline?:     string
    cursor?:      string
  }

  export interface GeographyProps {
    geography:      Geography
    style?: {
      default?: GeographyStyle
      hover?:   GeographyStyle
      pressed?: GeographyStyle
    }
    onClick?:       (event: React.MouseEvent<SVGPathElement>) => void
    onMouseEnter?:  (event: React.MouseEvent<SVGPathElement>) => void
    onMouseLeave?:  (event: React.MouseEvent<SVGPathElement>) => void
  }

  export interface MarkerProps {
    coordinates: [number, number]
    children?:   ReactNode
    style?:      React.CSSProperties
  }

  export const ComposableMap: ComponentType<ComposableMapProps>
  export const ZoomableGroup:  ComponentType<ZoomableGroupProps>
  export const Geographies:    ComponentType<GeographiesProps>
  export const Geography:      ComponentType<GeographyProps>
  export const Marker:         ComponentType<MarkerProps>
}
