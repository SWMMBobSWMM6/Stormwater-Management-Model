"""Minimal reader for EPA SWMM 5.x binary .out files (US or SI units).

Returns IDs and numpy arrays of node and link results per reporting period.
Node variables: 0 depth, 1 head, 2 volume, 3 lateral inflow, 4 total inflow,
5 flooding.  Link variables: 0 flow, 1 depth, 2 velocity, 3 volume,
4 capacity.  Values are in the file's own units.
"""
import struct
import numpy as np

MAGIC = 516114522


def read_out(path):
    with open(path, "rb") as fh:
        data = fh.read()
    rec = 4
    id_pos, prop_pos, out_pos, nper, err, magic2 = struct.unpack(
        "6i", data[-6 * rec:])
    magic1, version, flow_units, nsub, nnode, nlink, npoll = struct.unpack(
        "7i", data[:7 * rec])
    assert magic1 == MAGIC and magic2 == MAGIC, "not a SWMM .out file"
    pos = id_pos

    def read_ids(n):
        nonlocal pos
        ids = []
        for _ in range(n):
            (ln,) = struct.unpack("i", data[pos:pos + 4])
            pos += 4
            ids.append(data[pos:pos + ln].decode("latin-1"))
            pos += ln
        return ids

    sub_ids = read_ids(nsub)
    node_ids = read_ids(nnode)
    link_ids = read_ids(nlink)
    read_ids(npoll)

    # --- variable counts follow the input properties
    pos = prop_pos
    (n,) = struct.unpack("i", data[pos:pos + 4]); pos += 4 + 4 * n + 4 * nsub * n
    (n,) = struct.unpack("i", data[pos:pos + 4]); pos += 4 + 4 * n + 4 * nnode * n
    (n,) = struct.unpack("i", data[pos:pos + 4]); pos += 4 + 4 * n + 4 * nlink * n
    counts = []
    for _ in range(4):
        (n,) = struct.unpack("i", data[pos:pos + 4]); pos += 4 + 4 * n
        counts.append(n)
    nsv, nnv, nlv, nsys = counts
    start_date, report_step = struct.unpack("di", data[pos:pos + 12])

    bytes_per = 8 + 4 * (nsub * nsv + nnode * nnv + nlink * nlv + nsys)
    nodes = np.zeros((nper, nnode, nnv), dtype=np.float32)
    links = np.zeros((nper, nlink, nlv), dtype=np.float32)
    system = np.zeros((nper, nsys), dtype=np.float32)
    for p in range(nper):
        base = out_pos + p * bytes_per + 8
        vals = np.frombuffer(data, dtype=np.float32,
                             count=(bytes_per - 8) // 4, offset=base)
        o = nsub * nsv
        nodes[p] = vals[o:o + nnode * nnv].reshape(nnode, nnv)
        o += nnode * nnv
        links[p] = vals[o:o + nlink * nlv].reshape(nlink, nlv)
        o += nlink * nlv
        system[p] = vals[o:o + nsys]
    return {
        "flow_units": flow_units, "nodes": node_ids, "links": link_ids,
        "subcatch": sub_ids, "node": nodes, "link": links, "sys": system,
        "report_step": report_step, "periods": nper, "error": err,
    }


def series(res, kind, name, var):
    ids = res["nodes"] if kind == "node" else res["links"]
    return res[kind][:, ids.index(name), var].astype(float)
