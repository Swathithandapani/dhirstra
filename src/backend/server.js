const express = require("express");

const app = express();

app.get("/", (req, res) => {
    res.json({
        status: "OK",
        message: "Railway Express working"
    });
});

app.get("/test", (req,res)=>{
    res.send("TEST SUCCESS");
});


const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
    console.log("Server running on port " + PORT);
});