local doorsents = {"*180","*187","*194","*200","*208","*220","*227","*229","*145","*138","*131","*124","*173","*165","*158","*152"}
local doorsentsinto = {"*177","*184","*191","*198","*205","*217","*224","*212","*142","*135","**128","*121","*170","*163","*156","*149"}
        
--[[hook.Add( "PlayerUse", "some_unique_name2", function( ply, ent )
    for i = 1, table.Count(doorsents) do
        if (ent:GetModel() == doorsents[i] or ent:GetModel() == doorsentsinto[i]) then
            return false
        end
    end
end )--]]


print('doorunlocker has been loaded')