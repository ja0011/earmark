// =============================================================================
// Quicknode Streams — Go filter for Earmark on Arc testnet
// =============================================================================
// Dataset: Receipts. Keeps only logs emitted by the Earmark contract whose topic0
// is GiftCreated, GiftRedeemed or GiftRefunded, and returns nil (no delivery) for
// every other batch. The Earmark server (/webhooks/quicknode) re-decodes each log
// with viem and dedupes by transactionHash + logIndex.
// Same logic as filter.js; use whichever language the Streams editor is set to.
// =============================================================================

type Payload struct {
    Data     interface{}            `json:"data"`
    Metadata map[string]interface{} `json:"metadata"`
}

// Earmark on Arc testnet (contracts/deployments/arc-testnet.json), lower case.
var earmark = "0x9d91f4ee5ffad6a31d662801" +
    "b695514770c4d0bd"

// topic0 of each Earmark event (split in two to keep lines short).
var earmarkTopics = map[string]string{
    "0x011646b8aaaf35685f302664a2d64bbf" +
        "4527f9672523ba1b66ba4075c3fa89e6": "GiftCreated",
    "0x29a2780b7367ee72c019f299753b9068" +
        "538d72514af7b15e3c17c460075c3832": "GiftRedeemed",
    "0x6b5960a2dd87733f10cd737cafc43edc" +
        "838100cebade18aaa39b6fc66a18a93b": "GiftRefunded",
}

// lower lower-cases ASCII hex/addresses without needing the strings package.
func lower(s string) string {
    b := []byte(s)
    for i, c := range b {
        if c >= 'A' && c <= 'Z' {
            b[i] = c + 32
        }
    }
    return string(b)
}

// collect walks the payload (blocks -> receipts -> logs, whatever the nesting)
// and appends every Earmark event log it finds.
func collect(v interface{}, out *[]map[string]interface{}) {
    switch t := v.(type) {
    case []interface{}:
        for _, x := range t {
            collect(x, out)
        }
    case map[string]interface{}:
        addr, hasAddr := t["address"].(string)
        topics, hasTopics := t["topics"].([]interface{})
        if hasAddr && hasTopics {
            // This is a log object.
            if lower(addr) == earmark && len(topics) > 0 {
                if t0, ok := topics[0].(string); ok {
                    if name, ok := earmarkTopics[lower(t0)]; ok {
                        *out = append(*out, map[string]interface{}{
                            "event":           name,
                            "address":         addr,
                            "topics":          topics,
                            "data":            t["data"],
                            "transactionHash": t["transactionHash"],
                            "logIndex":        t["logIndex"],
                            "blockNumber":     t["blockNumber"],
                        })
                    }
                }
            }
            return
        }
        for _, x := range t {
            collect(x, out)
        }
    }
}

func Filter(qn *qn.QNContext, payload Payload) interface{} {
    var events []map[string]interface{}
    collect(payload.Data, &events)
    if len(events) == 0 {
        return nil // nothing for Earmark in this batch: skip delivery
    }
    return map[string]interface{}{"earmark": earmark, "events": events}
}
