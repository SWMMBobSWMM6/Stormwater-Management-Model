//  Wave speed c = sqrt(g*A/T) along the depth of a 3-ft circular FV link,
//  from the engine's own geometry table (buildTable, widthOf, areaOf),
//  for the essay's slot figure. Compile like test_closure.c.
#include "fvlink.c"
#include <stdio.h>
int main(void)
{
    static TFvLink f;
    TXsect x;
    double p[4] = {3.0, 0, 0, 0}, y, a, w;
    int k, n = 6000;
    memset(&x, 0, sizeof(x));
    if ( !xsect_setParams(&x, CIRCULAR, p, 1.0) ) return 1;
    memset(&f, 0, sizeof(f));
    f.closed = 1;
    buildTable(&f, &x);
    printf("# y_ft A_ft2 T_ft c_ftps   (3-ft circular, engine table)\n");
    for (k = 1; k <= n; k++)
    {
        y = 1.25 * 3.0 * k / n;
        a = areaOf(&f, y);
        w = widthOf(&f, y);
        printf("%.6f %.6f %.6f %.4f\n", y, a, w, sqrt(32.2 * a / w));
    }
    return 0;
}
