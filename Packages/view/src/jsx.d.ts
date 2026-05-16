/**
 * JSX type definitions for @hedystia/view
 *
 * Provides type definitions for all HTML and SVG intrinsic elements.
 */

export namespace JSX {
  export type Element =
    | HTMLElement
    | SVGElement
    | DocumentFragment
    | Text
    | Comment
    | string
    | number
    | boolean
    | null
    | undefined
    | (() => Element | Element[]);
  export type ElementClass = never;
  export interface ElementChildrenAttribute {
    children: {};
  }

  /**
   * Reactive type - allows a static value or an accessor function returning that value
   */
  export type Reactive<T> = T | (() => T);

  /**
   * Children type - supports single element, arrays of elements, strings, numbers, or functions (reactive)
   */
  export type Child =
    | Element
    | string
    | number
    | boolean
    | null
    | undefined
    | (() => Child | Child[]);
  export type Children = Child | Child[];

  export interface IntrinsicElements {
    // HTML Elements
    a: AnchorHTMLAttributes;
    abbr: HTMLAttributes;
    address: HTMLAttributes;
    area: AreaHTMLAttributes;
    article: HTMLAttributes;
    aside: HTMLAttributes;
    audio: AudioHTMLAttributes;
    b: HTMLAttributes;
    base: BaseHTMLAttributes;
    bdi: HTMLAttributes;
    bdo: HTMLAttributes;
    big: HTMLAttributes;
    blockquote: BlockquoteHTMLAttributes;
    body: HTMLAttributes;
    br: HTMLAttributes;
    button: ButtonHTMLAttributes;
    canvas: CanvasHTMLAttributes;
    caption: HTMLAttributes;
    cite: HTMLAttributes;
    code: HTMLAttributes;
    col: ColHTMLAttributes;
    colgroup: ColgroupHTMLAttributes;
    data: DataHTMLAttributes;
    datalist: HTMLAttributes;
    dd: HTMLAttributes;
    del: DelHTMLAttributes;
    details: DetailsHTMLAttributes;
    dfn: HTMLAttributes;
    dialog: DialogHTMLAttributes;
    div: HTMLAttributes;
    dl: HTMLAttributes;
    dt: HTMLAttributes;
    em: HTMLAttributes;
    embed: EmbedHTMLAttributes;
    fieldset: FieldsetHTMLAttributes;
    figcaption: HTMLAttributes;
    figure: HTMLAttributes;
    footer: HTMLAttributes;
    form: FormHTMLAttributes;
    h1: HTMLAttributes;
    h2: HTMLAttributes;
    h3: HTMLAttributes;
    h4: HTMLAttributes;
    h5: HTMLAttributes;
    h6: HTMLAttributes;
    head: HTMLAttributes;
    header: HTMLAttributes;
    hgroup: HTMLAttributes;
    hr: HTMLAttributes;
    html: HTMLAttributes;
    i: HTMLAttributes;
    iframe: IframeHTMLAttributes;
    img: ImgHTMLAttributes;
    input: InputHTMLAttributes;
    ins: InsHTMLAttributes;
    kbd: HTMLAttributes;
    keygen: KeygenHTMLAttributes;
    label: LabelHTMLAttributes;
    legend: HTMLAttributes;
    li: LiHTMLAttributes;
    link: LinkHTMLAttributes;
    main: HTMLAttributes;
    map: MapHTMLAttributes;
    mark: HTMLAttributes;
    menu: MenuHTMLAttributes;
    menuitem: HTMLAttributes;
    meta: MetaHTMLAttributes;
    meter: MeterHTMLAttributes;
    nav: HTMLAttributes;
    noscript: HTMLAttributes;
    object: ObjectHTMLAttributes;
    ol: OlHTMLAttributes;
    optgroup: OptgroupHTMLAttributes;
    option: OptionHTMLAttributes;
    output: OutputHTMLAttributes;
    p: HTMLAttributes;
    param: ParamHTMLAttributes;
    picture: HTMLAttributes;
    pre: HTMLAttributes;
    progress: ProgressHTMLAttributes;
    q: QuoteHTMLAttributes;
    rp: HTMLAttributes;
    rt: HTMLAttributes;
    ruby: HTMLAttributes;
    s: HTMLAttributes;
    samp: HTMLAttributes;
    script: ScriptHTMLAttributes;
    section: HTMLAttributes;
    select: SelectHTMLAttributes;
    small: HTMLAttributes;
    source: SourceHTMLAttributes;
    span: HTMLAttributes;
    strong: HTMLAttributes;
    style: StyleHTMLAttributes;
    sub: HTMLAttributes;
    summary: HTMLAttributes;
    sup: HTMLAttributes;
    table: TableHTMLAttributes;
    tbody: HTMLAttributes;
    td: TdHTMLAttributes;
    textarea: TextareaHTMLAttributes;
    tfoot: HTMLAttributes;
    th: ThHTMLAttributes;
    thead: HTMLAttributes;
    time: TimeHTMLAttributes;
    title: HTMLAttributes;
    tr: HTMLAttributes;
    track: TrackHTMLAttributes;
    u: HTMLAttributes;
    ul: HTMLAttributes;
    var: HTMLAttributes;
    video: VideoHTMLAttributes;
    wbr: HTMLAttributes;

    // SVG Elements
    svg: SvgHTMLAttributes;
    animate: AnimateHTMLAttributes;
    animateMotion: AnimateMotionHTMLAttributes;
    animateTransform: AnimateTransformHTMLAttributes;
    circle: CircleHTMLAttributes;
    clipPath: ClipPathHTMLAttributes;
    defs: DefsHTMLAttributes;
    desc: DescHTMLAttributes;
    ellipse: EllipseHTMLAttributes;
    feBlend: FeBlendHTMLAttributes;
    feColorMatrix: FeColorMatrixHTMLAttributes;
    feComponentTransfer: FeComponentTransferHTMLAttributes;
    feComposite: FeCompositeHTMLAttributes;
    feConvolveMatrix: FeConvolveMatrixHTMLAttributes;
    feDiffuseLighting: FeDiffuseLightingHTMLAttributes;
    feDisplacementMap: FeDisplacementMapHTMLAttributes;
    feDistantLight: FeDistantLightHTMLAttributes;
    feDropShadow: FeDropShadowHTMLAttributes;
    feFlood: FeFloodHTMLAttributes;
    feFuncA: FeFuncAHTMLAttributes;
    feFuncB: FeFuncBHTMLAttributes;
    feFuncG: FeFuncGHTMLAttributes;
    feFuncR: FeFuncRHTMLAttributes;
    feGaussianBlur: FeGaussianBlurHTMLAttributes;
    feImage: FeImageHTMLAttributes;
    feMerge: FeMergeHTMLAttributes;
    feMergeNode: FeMergeNodeHTMLAttributes;
    feMorphology: FeMorphologyHTMLAttributes;
    feOffset: FeOffsetHTMLAttributes;
    fePointLight: FePointLightHTMLAttributes;
    feSpecularLighting: FeSpecularLightingHTMLAttributes;
    feSpotLight: FeSpotLightHTMLAttributes;
    feTile: FeTileHTMLAttributes;
    feTurbulence: FeTurbulenceHTMLAttributes;
    filter: FilterHTMLAttributes;
    foreignObject: ForeignObjectHTMLAttributes;
    g: GHTMLAttributes;
    image: ImageHTMLAttributes;
    line: LineHTMLAttributes;
    linearGradient: LinearGradientHTMLAttributes;
    marker: MarkerHTMLAttributes;
    mask: MaskHTMLAttributes;
    metadata: MetadataHTMLAttributes;
    mpath: MpathHTMLAttributes;
    path: PathHTMLAttributes;
    pattern: PatternHTMLAttributes;
    polygon: PolygonHTMLAttributes;
    polyline: PolylineHTMLAttributes;
    radialGradient: RadialGradientHTMLAttributes;
    rect: RectHTMLAttributes;
    stop: StopHTMLAttributes;
    switch: SwitchHTMLAttributes;
    symbol: SymbolHTMLAttributes;
    text: TextHTMLAttributes;
    textPath: TextPathHTMLAttributes;
    tspan: TspanHTMLAttributes;
    use: UseHTMLAttributes;
    view: ViewHTMLAttributes;
  }

  // Base HTML Attributes
  export interface HTMLAttributes {
    accesskey?: Reactive<string>;
    class?: Reactive<string | (string | Accessor<string | boolean | undefined | null>)[]>;
    className?: Reactive<string | (string | Accessor<string | boolean | undefined | null>)[]>;
    classList?: Record<string, Reactive<boolean | undefined | null>>;
    contenteditable?: Reactive<boolean | "true" | "false" | "plaintext-only">;
    contextmenu?: Reactive<string>;
    dir?: Reactive<"ltr" | "rtl" | "auto">;
    draggable?: Reactive<boolean | "true" | "false">;
    hidden?: Reactive<boolean | "hidden" | "until-found">;
    id?: Reactive<string>;
    lang?: Reactive<string>;
    slot?: Reactive<string>;
    spellcheck?: Reactive<boolean | "true" | "false">;
    style?: Reactive<string | Record<string, string | number | undefined>>;
    tabindex?: Reactive<number | string>;
    title?: Reactive<string>;
    translate?: Reactive<"yes" | "no">;
    innerText?: Reactive<string | number>;
    innerHTML?: Reactive<string | number>;
    textContent?: Reactive<string | number>;
    onClick?: (event: MouseEvent) => void;
    onContextMenu?: (event: MouseEvent) => void;
    onDblClick?: (event: MouseEvent) => void;
    onDrag?: (event: DragEvent) => void;
    onDragEnd?: (event: DragEvent) => void;
    onDragEnter?: (event: DragEvent) => void;
    onDragLeave?: (event: DragEvent) => void;
    onDragOver?: (event: DragEvent) => void;
    onDragStart?: (event: DragEvent) => void;
    onDrop?: (event: DragEvent) => void;
    onMouseDown?: (event: MouseEvent) => void;
    onMouseEnter?: (event: MouseEvent) => void;
    onMouseLeave?: (event: MouseEvent) => void;
    onMouseMove?: (event: MouseEvent) => void;
    onMouseOut?: (event: MouseEvent) => void;
    onMouseOver?: (event: MouseEvent) => void;
    onMouseUp?: (event: MouseEvent) => void;
    onTouchCancel?: (event: TouchEvent) => void;
    onTouchEnd?: (event: TouchEvent) => void;
    onTouchMove?: (event: TouchEvent) => void;
    onTouchStart?: (event: TouchEvent) => void;
    onWheel?: (event: WheelEvent) => void;
    onInput?: (event: Event) => void;
    onChange?: (event: Event) => void;
    onKeyDown?: (event: KeyboardEvent) => void;
    onKeyUp?: (event: KeyboardEvent) => void;
    onFocus?: (event: FocusEvent) => void;
    onBlur?: (event: FocusEvent) => void;
    onScroll?: (event: UIEvent) => void;
    onLoad?: (event: Event) => void;
    onError?: (event: Event) => void;
    children?: JSX.Children;
  }

  // Specific Element Attributes (extending HTMLAttributes)
  export interface AnchorHTMLAttributes extends HTMLAttributes {
    download?: Reactive<string>;
    href?: Reactive<string>;
    hreflang?: Reactive<string>;
    media?: Reactive<string>;
    ping?: Reactive<string>;
    referrerpolicy?: Reactive<string>;
    rel?: Reactive<string>;
    target?: Reactive<string>;
    type?: Reactive<string>;
  }

  export interface AreaHTMLAttributes extends HTMLAttributes {
    alt?: Reactive<string>;
    coords?: Reactive<string>;
    download?: Reactive<string>;
    href?: Reactive<string>;
    hreflang?: Reactive<string>;
    media?: Reactive<string>;
    referrerpolicy?: Reactive<string>;
    rel?: Reactive<string>;
    shape?: Reactive<string>;
    target?: Reactive<string>;
  }

  export interface AudioHTMLAttributes extends HTMLAttributes {
    autoplay?: Reactive<boolean>;
    controls?: Reactive<boolean>;
    loop?: Reactive<boolean>;
    muted?: Reactive<boolean>;
    preload?: Reactive<string>;
    src?: Reactive<string>;
  }

  export interface BaseHTMLAttributes extends HTMLAttributes {
    href?: Reactive<string>;
    target?: Reactive<string>;
  }

  export interface BlockquoteHTMLAttributes extends HTMLAttributes {
    cite?: Reactive<string>;
  }

  export interface ButtonHTMLAttributes extends HTMLAttributes {
    autofocus?: Reactive<boolean>;
    disabled?: Reactive<boolean>;
    form?: Reactive<string>;
    formaction?: Reactive<string>;
    formenctype?: Reactive<string>;
    formmethod?: Reactive<string>;
    formnovalidate?: Reactive<boolean>;
    formtarget?: Reactive<string>;
    name?: Reactive<string>;
    type?: Reactive<string>;
    value?: Reactive<string>;
  }

  export interface CanvasHTMLAttributes extends HTMLAttributes {
    height?: Reactive<number | string>;
    width?: Reactive<number | string>;
  }

  export interface ColHTMLAttributes extends HTMLAttributes {
    span?: Reactive<number | string>;
  }

  export interface ColgroupHTMLAttributes extends HTMLAttributes {
    span?: Reactive<number | string>;
  }

  export interface DataHTMLAttributes extends HTMLAttributes {
    value?: Reactive<string>;
  }

  export interface DelHTMLAttributes extends HTMLAttributes {
    cite?: Reactive<string>;
    datetime?: Reactive<string>;
  }

  export interface DetailsHTMLAttributes extends HTMLAttributes {
    open?: Reactive<boolean>;
  }

  export interface DialogHTMLAttributes extends HTMLAttributes {
    open?: Reactive<boolean>;
  }

  export interface EmbedHTMLAttributes extends HTMLAttributes {
    height?: Reactive<number | string>;
    src?: Reactive<string>;
    type?: Reactive<string>;
    width?: Reactive<number | string>;
  }

  export interface FieldsetHTMLAttributes extends HTMLAttributes {
    disabled?: Reactive<boolean>;
    form?: Reactive<string>;
    name?: Reactive<string>;
  }

  export interface FormHTMLAttributes extends HTMLAttributes {
    acceptcharset?: Reactive<string>;
    action?: Reactive<string>;
    autocomplete?: Reactive<string>;
    enctype?: Reactive<string>;
    method?: Reactive<string>;
    name?: Reactive<string>;
    novalidate?: Reactive<boolean>;
    target?: Reactive<string>;
  }

  export interface IframeHTMLAttributes extends HTMLAttributes {
    allow?: Reactive<string>;
    allowfullscreen?: Reactive<boolean>;
    allowpaymentrequest?: Reactive<boolean>;
    height?: Reactive<number | string>;
    loading?: Reactive<"eager" | "lazy">;
    name?: Reactive<string>;
    referrerpolicy?: Reactive<string>;
    sandbox?: Reactive<string>;
    src?: Reactive<string>;
    srcdoc?: Reactive<string>;
    width?: Reactive<number | string>;
  }

  export interface ImgHTMLAttributes extends HTMLAttributes {
    alt?: Reactive<string>;
    crossorigin?: Reactive<string>;
    decoding?: Reactive<"async" | "auto" | "sync">;
    height?: Reactive<number | string>;
    loading?: Reactive<"eager" | "lazy">;
    referrerpolicy?: Reactive<string>;
    sizes?: Reactive<string>;
    src?: Reactive<string>;
    srcset?: Reactive<string>;
    usemap?: Reactive<string>;
    width?: Reactive<number | string>;
  }

  export interface InputHTMLAttributes extends HTMLAttributes {
    accept?: Reactive<string>;
    alt?: Reactive<string>;
    autocomplete?: Reactive<string>;
    autofocus?: Reactive<boolean>;
    capture?: Reactive<boolean | string>;
    checked?: Reactive<boolean>;
    crossorigin?: Reactive<string>;
    disabled?: Reactive<boolean>;
    form?: Reactive<string>;
    formaction?: Reactive<string>;
    formenctype?: Reactive<string>;
    formmethod?: Reactive<string>;
    formnovalidate?: Reactive<boolean>;
    formtarget?: Reactive<string>;
    height?: Reactive<number | string>;
    list?: Reactive<string>;
    max?: Reactive<number | string>;
    maxlength?: Reactive<number | string>;
    min?: Reactive<number | string>;
    minlength?: Reactive<number | string>;
    multiple?: Reactive<boolean>;
    name?: Reactive<string>;
    pattern?: Reactive<string>;
    placeholder?: Reactive<string>;
    readonly?: Reactive<boolean>;
    required?: Reactive<boolean>;
    size?: Reactive<number | string>;
    src?: Reactive<string>;
    step?: Reactive<number | string>;
    type?: Reactive<string>;
    value?: Reactive<string>;
    width?: Reactive<number | string>;
  }

  export interface InsHTMLAttributes extends HTMLAttributes {
    cite?: Reactive<string>;
    datetime?: Reactive<string>;
  }

  export interface KeygenHTMLAttributes extends HTMLAttributes {
    autofocus?: Reactive<boolean>;
    challenge?: Reactive<string>;
    disabled?: Reactive<boolean>;
    form?: Reactive<string>;
    keytype?: Reactive<string>;
    name?: Reactive<string>;
  }

  export interface LabelHTMLAttributes extends HTMLAttributes {
    form?: Reactive<string>;
    for?: Reactive<string>;
  }

  export interface LiHTMLAttributes extends HTMLAttributes {
    value?: Reactive<number | string>;
  }

  export interface LinkHTMLAttributes extends HTMLAttributes {
    as?: Reactive<string>;
    crossorigin?: Reactive<string>;
    href?: Reactive<string>;
    hreflang?: Reactive<string>;
    integrity?: Reactive<string>;
    media?: Reactive<string>;
    referrerpolicy?: Reactive<string>;
    rel?: Reactive<string>;
    sizes?: Reactive<string>;
    type?: Reactive<string>;
  }

  export interface MapHTMLAttributes extends HTMLAttributes {
    name?: Reactive<string>;
  }

  export interface MenuHTMLAttributes extends HTMLAttributes {
    type?: Reactive<string>;
  }

  export interface MetaHTMLAttributes extends HTMLAttributes {
    charset?: Reactive<string>;
    content?: Reactive<string>;
    httpequiv?: Reactive<string>;
    media?: Reactive<string>;
    name?: Reactive<string>;
  }

  export interface MeterHTMLAttributes extends HTMLAttributes {
    form?: Reactive<string>;
    high?: Reactive<number | string>;
    low?: Reactive<number | string>;
    max?: Reactive<number | string>;
    min?: Reactive<number | string>;
    optimum?: Reactive<number | string>;
    value?: Reactive<number | string>;
  }

  export interface ObjectHTMLAttributes extends HTMLAttributes {
    data?: Reactive<string>;
    form?: Reactive<string>;
    height?: Reactive<number | string>;
    name?: Reactive<string>;
    type?: Reactive<string>;
    usemap?: Reactive<string>;
    width?: Reactive<number | string>;
  }

  export interface OlHTMLAttributes extends HTMLAttributes {
    reversed?: Reactive<boolean>;
    start?: Reactive<number | string>;
    type?: Reactive<string>;
  }

  export interface OptgroupHTMLAttributes extends HTMLAttributes {
    disabled?: Reactive<boolean>;
    label?: Reactive<string>;
  }

  export interface OptionHTMLAttributes extends HTMLAttributes {
    disabled?: Reactive<boolean>;
    label?: Reactive<string>;
    selected?: Reactive<boolean>;
    value?: Reactive<string>;
  }

  export interface OutputHTMLAttributes extends HTMLAttributes {
    form?: Reactive<string>;
    for?: Reactive<string>;
    name?: Reactive<string>;
  }

  export interface ParamHTMLAttributes extends HTMLAttributes {
    name?: Reactive<string>;
    value?: Reactive<string>;
  }

  export interface ProgressHTMLAttributes extends HTMLAttributes {
    max?: Reactive<number | string>;
    value?: Reactive<number | string>;
  }

  export interface QuoteHTMLAttributes extends HTMLAttributes {
    cite?: Reactive<string>;
  }

  export interface ScriptHTMLAttributes extends HTMLAttributes {
    async?: Reactive<boolean>;
    charset?: Reactive<string>;
    crossorigin?: Reactive<string>;
    defer?: Reactive<boolean>;
    integrity?: Reactive<string>;
    nomodule?: Reactive<boolean>;
    referrerpolicy?: Reactive<string>;
    src?: Reactive<string>;
    type?: Reactive<string>;
  }

  export interface SelectHTMLAttributes extends HTMLAttributes {
    autocomplete?: Reactive<string>;
    autofocus?: Reactive<boolean>;
    disabled?: Reactive<boolean>;
    form?: Reactive<string>;
    multiple?: Reactive<boolean>;
    name?: Reactive<string>;
    required?: Reactive<boolean>;
    size?: Reactive<number | string>;
    value?: Reactive<string>;
  }

  export interface SourceHTMLAttributes extends HTMLAttributes {
    media?: Reactive<string>;
    sizes?: Reactive<string>;
    src?: Reactive<string>;
    srcset?: Reactive<string>;
    type?: Reactive<string>;
  }

  export interface StyleHTMLAttributes extends HTMLAttributes {
    media?: Reactive<string>;
    type?: Reactive<string>;
  }

  export interface TableHTMLAttributes extends HTMLAttributes {
    align?: Reactive<string>;
    border?: Reactive<number | string>;
    cellpadding?: Reactive<number | string>;
    cellspacing?: Reactive<number | string>;
    summary?: Reactive<string>;
    width?: Reactive<number | string>;
  }

  export interface TdHTMLAttributes extends HTMLAttributes {
    align?: Reactive<string>;
    colspan?: Reactive<number | string>;
    headers?: Reactive<string>;
    rowspan?: Reactive<number | string>;
    scope?: Reactive<string>;
    valign?: Reactive<string>;
    width?: Reactive<number | string>;
  }

  export interface TextareaHTMLAttributes extends HTMLAttributes {
    autocomplete?: Reactive<string>;
    autofocus?: Reactive<boolean>;
    cols?: Reactive<number | string>;
    dirname?: Reactive<string>;
    disabled?: Reactive<boolean>;
    form?: Reactive<string>;
    maxlength?: Reactive<number | string>;
    minlength?: Reactive<number | string>;
    name?: Reactive<string>;
    placeholder?: Reactive<string>;
    readonly?: Reactive<boolean>;
    required?: Reactive<boolean>;
    rows?: Reactive<number | string>;
    wrap?: Reactive<string>;
    value?: Reactive<string>;
  }

  export interface ThHTMLAttributes extends HTMLAttributes {
    align?: Reactive<string>;
    colspan?: Reactive<number | string>;
    headers?: Reactive<string>;
    rowspan?: Reactive<number | string>;
    scope?: Reactive<string>;
    valign?: Reactive<string>;
    width?: Reactive<number | string>;
  }

  export interface TimeHTMLAttributes extends HTMLAttributes {
    datetime?: Reactive<string>;
  }

  export interface TrackHTMLAttributes extends HTMLAttributes {
    default?: Reactive<boolean>;
    kind?: Reactive<string>;
    label?: Reactive<string>;
    src?: Reactive<string>;
    srclang?: Reactive<string>;
  }

  export interface VideoHTMLAttributes extends HTMLAttributes {
    autoplay?: Reactive<boolean>;
    controls?: Reactive<boolean>;
    height?: Reactive<number | string>;
    loop?: Reactive<boolean>;
    muted?: Reactive<boolean>;
    playsinline?: Reactive<boolean>;
    poster?: Reactive<string>;
    preload?: Reactive<string>;
    src?: Reactive<string>;
    width?: Reactive<number | string>;
  }

  // SVG Attributes
  export interface SvgHTMLAttributes extends SVGAttributes {
    height?: Reactive<number | string>;
    preserveAspectRatio?: Reactive<string>;
    viewBox?: Reactive<string>;
    width?: Reactive<number | string>;
    xmlns?: Reactive<string>;
  }

  export interface CircleHTMLAttributes extends SVGAttributes {
    cx?: Reactive<number | string>;
    cy?: Reactive<number | string>;
    r?: Reactive<number | string>;
  }

  export interface EllipseHTMLAttributes extends SVGAttributes {
    cx?: Reactive<number | string>;
    cy?: Reactive<number | string>;
    rx?: Reactive<number | string>;
    ry?: Reactive<number | string>;
  }

  export interface LineHTMLAttributes extends SVGAttributes {
    x1?: Reactive<number | string>;
    x2?: Reactive<number | string>;
    y1?: Reactive<number | string>;
    y2?: Reactive<number | string>;
  }

  export interface PathHTMLAttributes extends SVGAttributes {
    d?: Reactive<string>;
    pathLength?: Reactive<number | string>;
  }

  export interface PolygonHTMLAttributes extends SVGAttributes {
    points?: Reactive<string>;
  }

  export interface PolylineHTMLAttributes extends SVGAttributes {
    points?: Reactive<string>;
  }

  export interface RectHTMLAttributes extends SVGAttributes {
    height?: Reactive<number | string>;
    rx?: Reactive<number | string>;
    ry?: Reactive<number | string>;
    width?: Reactive<number | string>;
    x?: Reactive<number | string>;
    y?: Reactive<number | string>;
  }

  export interface TextHTMLAttributes extends SVGAttributes {
    dx?: Reactive<number | string>;
    dy?: Reactive<number | string>;
    lengthAdjust?: Reactive<string>;
    textLength?: Reactive<number | string>;
    x?: Reactive<number | string>;
    y?: Reactive<number | string>;
  }

  export interface ImageHTMLAttributes extends SVGAttributes {
    height?: Reactive<number | string>;
    href?: Reactive<string>;
    preserveAspectRatio?: Reactive<string>;
    width?: Reactive<number | string>;
    x?: Reactive<number | string>;
    y?: Reactive<number | string>;
  }

  export interface GHTMLAttributes extends SVGAttributes {}

  export interface SVGAttributes extends HTMLAttributes {
    accentHeight?: Reactive<number | string>;
    accumulate?: Reactive<string>;
    additive?: Reactive<string>;
    alignmentBaseline?: Reactive<string>;
    allowReorder?: Reactive<string>;
    alphabetic?: Reactive<number | string>;
    amplitude?: Reactive<number | string>;
    arabicForm?: Reactive<string>;
    ascent?: Reactive<number | string>;
    attributeName?: Reactive<string>;
    attributeType?: Reactive<string>;
    autoReverse?: Reactive<string>;
    azimuth?: Reactive<number | string>;
    baseFrequency?: Reactive<number | string>;
    baselineShift?: Reactive<number | string>;
    baseProfile?: Reactive<number | string>;
    bbox?: Reactive<number | string>;
    begin?: Reactive<number | string>;
    bias?: Reactive<number | string>;
    by?: Reactive<number | string>;
    calcMode?: Reactive<string>;
    capHeight?: Reactive<number | string>;
    clip?: Reactive<number | string>;
    clipPath?: Reactive<string>;
    clipPathUnits?: Reactive<number | string>;
    clipRule?: Reactive<string>;
    color?: Reactive<string>;
    colorInterpolation?: Reactive<string>;
    colorInterpolationFilters?: Reactive<string>;
    colorProfile?: Reactive<string>;
    colorRendering?: Reactive<string>;
    contentScriptType?: Reactive<string>;
    contentStyleType?: Reactive<string>;
    cursor?: Reactive<string>;
    cx?: Reactive<number | string>;
    cy?: Reactive<number | string>;
    d?: Reactive<string>;
    decelerate?: Reactive<number | string>;
    descent?: Reactive<number | string>;
    diffuseConstant?: Reactive<number | string>;
    direction?: Reactive<string>;
    display?: Reactive<string>;
    divisor?: Reactive<number | string>;
    dominantBaseline?: Reactive<string>;
    dur?: Reactive<number | string>;
    dx?: Reactive<number | string>;
    dy?: Reactive<number | string>;
    edgeMode?: Reactive<string>;
    elevation?: Reactive<number | string>;
    enableBackground?: Reactive<string>;
    end?: Reactive<number | string>;
    exponent?: Reactive<number | string>;
    externalResourcesRequired?: Reactive<string>;
    fill?: Reactive<string>;
    fillOpacity?: Reactive<number | string>;
    fillRule?: Reactive<string>;
    filter?: Reactive<string>;
    filterRes?: Reactive<number | string>;
    filterUnits?: Reactive<number | string>;
    floodColor?: Reactive<string>;
    floodOpacity?: Reactive<number | string>;
    focusable?: Reactive<string>;
    fontFamily?: Reactive<string>;
    fontSize?: Reactive<number | string>;
    fontSizeAdjust?: Reactive<number | string>;
    fontStretch?: Reactive<string>;
    fontStyle?: Reactive<string>;
    fontVariant?: Reactive<string>;
    fontWeight?: Reactive<number | string>;
    format?: Reactive<number | string>;
    fr?: Reactive<number | string>;
    from?: Reactive<number | string>;
    fx?: Reactive<number | string>;
    fy?: Reactive<number | string>;
    g1?: Reactive<number | string>;
    g2?: Reactive<number | string>;
    glyphName?: Reactive<number | string>;
    glyphOrientationHorizontal?: Reactive<number | string>;
    glyphOrientationVertical?: Reactive<number | string>;
    glyphRef?: Reactive<number | string>;
    gradientTransform?: Reactive<string>;
    gradientUnits?: Reactive<string>;
    hanging?: Reactive<number | string>;
    horizAdvX?: Reactive<number | string>;
    horizOriginX?: Reactive<number | string>;
    href?: Reactive<string>;
    ideographic?: Reactive<number | string>;
    imageRendering?: Reactive<string>;
    in2?: Reactive<number | string>;
    in?: Reactive<string>;
    intercept?: Reactive<number | string>;
    k1?: Reactive<number | string>;
    k2?: Reactive<number | string>;
    k3?: Reactive<number | string>;
    k4?: Reactive<number | string>;
    k?: Reactive<number | string>;
    kernelMatrix?: Reactive<number | string>;
    kernelUnitLength?: Reactive<number | string>;
    kerning?: Reactive<number | string>;
    keyPoints?: Reactive<number | string>;
    keySplines?: Reactive<number | string>;
    keyTimes?: Reactive<number | string>;
    lengthAdjust?: Reactive<number | string>;
    letterSpacing?: Reactive<number | string>;
    lightingColor?: Reactive<string>;
    limitingConeAngle?: Reactive<number | string>;
    local?: Reactive<number | string>;
    markerEnd?: Reactive<string>;
    markerHeight?: Reactive<number | string>;
    markerMid?: Reactive<string>;
    markerStart?: Reactive<string>;
    markerUnits?: Reactive<number | string>;
    markerWidth?: Reactive<number | string>;
    mask?: Reactive<string>;
    maskContentUnits?: Reactive<number | string>;
    maskUnits?: Reactive<number | string>;
    mathematical?: Reactive<number | string>;
    mode?: Reactive<string>;
    numOctaves?: Reactive<number | string>;
    offset?: Reactive<number | string>;
    opacity?: Reactive<number | string>;
    operator?: Reactive<string>;
    order?: Reactive<number | string>;
    orient?: Reactive<string>;
    orientation?: Reactive<number | string>;
    origin?: Reactive<number | string>;
    overflow?: Reactive<string>;
    overlinePosition?: Reactive<number | string>;
    overlineThickness?: Reactive<number | string>;
    paintOrder?: Reactive<string>;
    panose1?: Reactive<number | string>;
    path?: Reactive<string>;
    pathLength?: Reactive<number | string>;
    patternContentUnits?: Reactive<string>;
    patternTransform?: Reactive<number | string>;
    patternUnits?: Reactive<string>;
    pointerEvents?: Reactive<string>;
    points?: Reactive<string>;
    pointsAtX?: Reactive<number | string>;
    pointsAtY?: Reactive<number | string>;
    pointsAtZ?: Reactive<number | string>;
    preserveAlpha?: Reactive<number | string>;
    preserveAspectRatio?: Reactive<string>;
    primitiveUnits?: Reactive<number | string>;
    r?: Reactive<number | string>;
    radius?: Reactive<number | string>;
    refX?: Reactive<number | string>;
    refY?: Reactive<number | string>;
    renderingIntent?: Reactive<string>;
    repeatCount?: Reactive<number | string>;
    repeatDur?: Reactive<number | string>;
    requiredExtensions?: Reactive<number | string>;
    requiredFeatures?: Reactive<number | string>;
    restart?: Reactive<number | string>;
    result?: Reactive<string>;
    rotate?: Reactive<number | string>;
    rx?: Reactive<number | string>;
    ry?: Reactive<number | string>;
    scale?: Reactive<number | string>;
    seed?: Reactive<number | string>;
    shapeRendering?: Reactive<string>;
    slope?: Reactive<number | string>;
    spacing?: Reactive<number | string>;
    specularConstant?: Reactive<number | string>;
    specularExponent?: Reactive<number | string>;
    speed?: Reactive<number | string>;
    spreadMethod?: Reactive<string>;
    startOffset?: Reactive<number | string>;
    stdDeviation?: Reactive<number | string>;
    stemh?: Reactive<number | string>;
    stemv?: Reactive<number | string>;
    stitchTiles?: Reactive<number | string>;
    stopColor?: Reactive<string>;
    stopOpacity?: Reactive<number | string>;
    strikethroughPosition?: Reactive<number | string>;
    strikethroughThickness?: Reactive<number | string>;
    string?: Reactive<number | string>;
    stroke?: Reactive<string>;
    strokeDasharray?: Reactive<string | number>;
    strokeDashoffset?: Reactive<string | number>;
    strokeLinecap?: Reactive<string>;
    strokeLinejoin?: Reactive<string>;
    strokeMiterlimit?: Reactive<number | string>;
    strokeOpacity?: Reactive<number | string>;
    strokeWidth?: Reactive<number | string>;
    surfaceScale?: Reactive<number | string>;
    systemLanguage?: Reactive<number | string>;
    tableValues?: Reactive<number | string>;
    targetX?: Reactive<number | string>;
    targetY?: Reactive<number | string>;
    textAnchor?: Reactive<string>;
    textDecoration?: Reactive<number | string>;
    textLength?: Reactive<number | string>;
    textRendering?: Reactive<string>;
    to?: Reactive<number | string>;
    transform?: Reactive<string>;
    u1?: Reactive<number | string>;
    u2?: Reactive<number | string>;
    underlinePosition?: Reactive<number | string>;
    underlineThickness?: Reactive<number | string>;
    unicode?: Reactive<number | string>;
    unicodeBidi?: Reactive<string>;
    unicodeRange?: Reactive<number | string>;
    unitsPerEm?: Reactive<number | string>;
    vAlphabetic?: Reactive<number | string>;
    values?: Reactive<string>;
    vectorEffect?: Reactive<string>;
    version?: Reactive<string>;
    vertAdvY?: Reactive<number | string>;
    vertOriginX?: Reactive<number | string>;
    vertOriginY?: Reactive<number | string>;
    vHanging?: Reactive<number | string>;
    vIdeographic?: Reactive<number | string>;
    viewBox?: Reactive<string>;
    viewTarget?: Reactive<number | string>;
    visibility?: Reactive<string>;
    vMathematical?: Reactive<number | string>;
    widths?: Reactive<number | string>;
    wordSpacing?: Reactive<number | string>;
    writingMode?: Reactive<string>;
    x1?: Reactive<number | string>;
    x2?: Reactive<number | string>;
    x?: Reactive<number | string>;
    xChannelSelector?: Reactive<string>;
    xHeight?: Reactive<number | string>;
    xlinkActuate?: Reactive<string>;
    xlinkArcrole?: Reactive<string>;
    xlinkHref?: Reactive<string>;
    xlinkRole?: Reactive<string>;
    xlinkShow?: Reactive<string>;
    xlinkTitle?: Reactive<string>;
    xlinkType?: Reactive<string>;
    xmlBase?: Reactive<string>;
    xmlLang?: Reactive<string>;
    xmlns?: Reactive<string>;
    xmlnsXlink?: Reactive<string>;
    xmlSpace?: Reactive<string>;
    y1?: Reactive<number | string>;
    y2?: Reactive<number | string>;
    y?: Reactive<number | string>;
    yChannelSelector?: Reactive<string>;
    z?: Reactive<number | string>;
    zoomAndPan?: Reactive<string>;
  }

  // Other SVG element attributes (extending SVGAttributes)
  export interface AnimateHTMLAttributes extends SVGAttributes {}
  export interface AnimateMotionHTMLAttributes extends SVGAttributes {}
  export interface AnimateTransformHTMLAttributes extends SVGAttributes {}
  export interface ClipPathHTMLAttributes extends SVGAttributes {}
  export interface DefsHTMLAttributes extends SVGAttributes {}
  export interface DescHTMLAttributes extends SVGAttributes {}
  export interface FeBlendHTMLAttributes extends SVGAttributes {}
  export interface FeColorMatrixHTMLAttributes extends SVGAttributes {}
  export interface FeComponentTransferHTMLAttributes extends SVGAttributes {}
  export interface FeCompositeHTMLAttributes extends SVGAttributes {}
  export interface FeConvolveMatrixHTMLAttributes extends SVGAttributes {}
  export interface FeDiffuseLightingHTMLAttributes extends SVGAttributes {}
  export interface FeDisplacementMapHTMLAttributes extends SVGAttributes {}
  export interface FeDistantLightHTMLAttributes extends SVGAttributes {}
  export interface FeDropShadowHTMLAttributes extends SVGAttributes {}
  export interface FeFloodHTMLAttributes extends SVGAttributes {}
  export interface FeFuncAHTMLAttributes extends SVGAttributes {}
  export interface FeFuncBHTMLAttributes extends SVGAttributes {}
  export interface FeFuncGHTMLAttributes extends SVGAttributes {}
  export interface FeFuncRHTMLAttributes extends SVGAttributes {}
  export interface FeGaussianBlurHTMLAttributes extends SVGAttributes {}
  export interface FeImageHTMLAttributes extends SVGAttributes {}
  export interface FeMergeHTMLAttributes extends SVGAttributes {}
  export interface FeMergeNodeHTMLAttributes extends SVGAttributes {}
  export interface FeMorphologyHTMLAttributes extends SVGAttributes {}
  export interface FeOffsetHTMLAttributes extends SVGAttributes {}
  export interface FePointLightHTMLAttributes extends SVGAttributes {}
  export interface FeSpecularLightingHTMLAttributes extends SVGAttributes {}
  export interface FeSpotLightHTMLAttributes extends SVGAttributes {}
  export interface FeTileHTMLAttributes extends SVGAttributes {}
  export interface FeTurbulenceHTMLAttributes extends SVGAttributes {}
  export interface FilterHTMLAttributes extends SVGAttributes {}
  export interface ForeignObjectHTMLAttributes extends SVGAttributes {}
  export interface LinearGradientHTMLAttributes extends SVGAttributes {}
  export interface MarkerHTMLAttributes extends SVGAttributes {}
  export interface MaskHTMLAttributes extends SVGAttributes {}
  export interface MetadataHTMLAttributes extends SVGAttributes {}
  export interface MpathHTMLAttributes extends SVGAttributes {}
  export interface PatternHTMLAttributes extends SVGAttributes {}
  export interface RadialGradientHTMLAttributes extends SVGAttributes {}
  export interface StopHTMLAttributes extends SVGAttributes {}
  export interface SwitchHTMLAttributes extends SVGAttributes {}
  export interface SymbolHTMLAttributes extends SVGAttributes {}
  export interface TextPathHTMLAttributes extends SVGAttributes {}
  export interface TspanHTMLAttributes extends SVGAttributes {}
  export interface UseHTMLAttributes extends SVGAttributes {}
  export interface ViewHTMLAttributes extends SVGAttributes {}
}

declare module "*.css";
declare module "*.scss";
declare module "*.sass";
declare module "*.less";
