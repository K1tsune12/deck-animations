// Pipes: shiny 3D pipes growing through a grid, one segment at a time, until
// the screen fills up and it starts over (a nod to the 90s classic).

const GRID = { x: 16, y: 10, z: 10 };
const SEGMENTS_PER_SEC = 18;
const MAX_SEGMENTS = 900;
const MAX_PIPES = 6;
const TURN_CHANCE = 0.3;
const DIRS = [ [ 1, 0, 0 ], [ -1, 0, 0 ], [ 0, 1, 0 ], [ 0, -1, 0 ], [ 0, 0, 1 ], [ 0, 0, -1 ] ];

const view = CreateCanvas();
let occupied, pipes, segments, pending, fading;

function Key( p ) { return p.join( ',' ); }

function Reset()
{
    occupied = new Set();
    pipes = [];
    segments = 0;
    pending = 0;
    fading = 0;
    view.ctx.fillStyle = 'black';
    view.ctx.fillRect( 0, 0, view.width, view.height );
}

// isometric-ish projection of grid coordinates (z goes "into" the screen)
function Project( [ x, y, z ] )
{
    const cell = Math.min( view.width / ( GRID.x + GRID.z * 0.5 ), view.height / ( GRID.y + GRID.z * 0.35 ) );
    const ox = ( view.width - cell * ( GRID.x + GRID.z * 0.5 ) ) / 2;
    const oy = ( view.height - cell * ( GRID.y + GRID.z * 0.35 ) ) / 2;
    return {
        x: ox + ( x + ( GRID.z - z ) * 0.5 ) * cell,
        y: oy + ( y + z * 0.35 ) * cell,
        r: cell * 0.22 * ( 1.15 - z / GRID.z * 0.3 ),
    };
}

function Free( p )
{
    return p[ 0 ] >= 0 && p[ 0 ] < GRID.x && p[ 1 ] >= 0 && p[ 1 ] < GRID.y && p[ 2 ] >= 0 && p[ 2 ] < GRID.z && !occupied.has( Key( p ) );
}

function NewPipe()
{
    for ( let tries = 0; tries < 50; tries++ )
    {
        const p = [ RandInt( GRID.x ), RandInt( GRID.y ), RandInt( GRID.z ) ];
        if ( Free( p ) )
        {
            occupied.add( Key( p ) );
            const pipe = { pos: p, dir: DIRS[ RandInt( 6 ) ], hue: Rand( 0, 360 ), alive: true };
            DrawJoint( pipe, p );
            return pipe;
        }
    }
    return null;
}

function DrawJoint( pipe, p )
{
    const { ctx } = view;
    const { x, y, r } = Project( p );
    const g = ctx.createRadialGradient( x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r * 1.25 );
    g.addColorStop( 0, `hsl(${ pipe.hue }, 80%, 85%)` );
    g.addColorStop( 0.5, `hsl(${ pipe.hue }, 75%, 50%)` );
    g.addColorStop( 1, `hsl(${ pipe.hue }, 75%, 18%)` );
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc( x, y, r * 1.25, 0, Math.PI * 2 );
    ctx.fill();
}

function DrawSegment( pipe, a, b )
{
    const { ctx } = view;
    const pa = Project( a ), pb = Project( b );
    const dx = pb.x - pa.x, dy = pb.y - pa.y;
    const len = Math.hypot( dx, dy ) || 1;
    const nx = -dy / len, ny = dx / len;
    const r = ( pa.r + pb.r ) / 2;
    // shade across the tube: dark edge, bright highlight, dark edge
    const g = ctx.createLinearGradient( pa.x + nx * r, pa.y + ny * r, pa.x - nx * r, pa.y - ny * r );
    g.addColorStop( 0, `hsl(${ pipe.hue }, 75%, 15%)` );
    g.addColorStop( 0.3, `hsl(${ pipe.hue }, 80%, 70%)` );
    g.addColorStop( 0.45, `hsl(${ pipe.hue }, 70%, 50%)` );
    g.addColorStop( 1, `hsl(${ pipe.hue }, 75%, 12%)` );
    ctx.strokeStyle = g;
    ctx.lineWidth = r * 2;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo( pa.x, pa.y );
    ctx.lineTo( pb.x, pb.y );
    ctx.stroke();
}

function Grow( pipe )
{
    let dirs = DIRS.filter( d => Free( pipe.pos.map( ( v, i ) => v + d[ i ] ) ) );
    if ( dirs.length === 0 )
    {
        pipe.alive = false;
        return;
    }
    const straight = dirs.find( d => d === pipe.dir );
    const dir = straight && Math.random() > TURN_CHANCE ? straight : dirs[ RandInt( dirs.length ) ];
    const next = pipe.pos.map( ( v, i ) => v + dir[ i ] );
    if ( dir !== pipe.dir )
        DrawJoint( pipe, pipe.pos );
    DrawSegment( pipe, pipe.pos, next );
    occupied.add( Key( next ) );
    pipe.pos = next;
    pipe.dir = dir;
    segments++;
}

view.onResize = Reset;
Reset();

RunLoop( dt =>
{
    if ( fading > 0 )
    {
        fading -= dt;
        view.ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
        view.ctx.fillRect( 0, 0, view.width, view.height );
        if ( fading <= 0 )
            Reset();
        return;
    }

    pending += dt * SEGMENTS_PER_SEC;
    while ( pending >= 1 )
    {
        pending--;
        pipes = pipes.filter( p => p.alive );
        if ( pipes.length < MAX_PIPES && ( pipes.length === 0 || Math.random() < 0.04 ) )
        {
            const pipe = NewPipe();
            if ( pipe )
                pipes.push( pipe );
        }
        pipes.forEach( Grow );
        if ( segments >= MAX_SEGMENTS || pipes.length === 0 )
        {
            fading = 2;
            break;
        }
    }
} );
