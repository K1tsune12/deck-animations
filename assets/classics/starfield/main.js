// Starfield: flying forward through space, stars streaking past.

const STAR_COUNT = 700;
const DEPTH = 1000;
const SPEED = 260; // depth units per second
const FOV = 0.9;

const view = CreateCanvas();
const stars = [];

function Reset( star, anywhere )
{
    star.x = Rand( -1, 1 ) * DEPTH;
    star.y = Rand( -1, 1 ) * DEPTH;
    star.z = anywhere ? Rand( 1, DEPTH ) : DEPTH;
    star.pz = star.z;
}

for ( let i = 0; i < STAR_COUNT; i++ )
{
    const star = {};
    Reset( star, true );
    stars.push( star );
}

function Project( x, y, z )
{
    const scale = ( Math.min( view.width, view.height ) * FOV ) / z;
    return [ view.width / 2 + x * scale, view.height / 2 + y * scale ];
}

RunLoop( dt =>
{
    const { ctx } = view;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect( 0, 0, view.width, view.height );
    ctx.lineCap = 'round';

    for ( const star of stars )
    {
        star.pz = star.z;
        star.z -= SPEED * dt;
        if ( star.z <= 1 )
        {
            Reset( star, false );
            continue;
        }
        const [ x, y ] = Project( star.x, star.y, star.z );
        const [ px, py ] = Project( star.x, star.y, star.pz );
        if ( x < 0 || x > view.width || y < 0 || y > view.height )
        {
            Reset( star, false );
            continue;
        }
        const nearness = 1 - star.z / DEPTH;
        ctx.strokeStyle = `rgba(255, 255, 255, ${ 0.25 + nearness * 0.75 })`;
        ctx.lineWidth = 0.5 + nearness * 2.5;
        ctx.beginPath();
        ctx.moveTo( px, py );
        ctx.lineTo( x, y );
        ctx.stroke();
    }
} );
