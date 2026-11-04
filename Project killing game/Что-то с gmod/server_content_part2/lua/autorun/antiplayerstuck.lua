if not SERVER then return end

local function CheckIfPlayerStuck()
	for k,v in pairs(player.GetAll()) do
		if IsValid(v) and v:IsPlayer() and v:Alive() and v:GetNWString("EngrammaOf")~="" then
			if not v:InVehicle() then
				local Offset = Vector(5, 5, 5)
				local Stuck = false
				
				if v.Stuck == nil then
					v.Stuck = false
				end
				
				if v.Stuck then
					Offset = Vector(2, 2, 2)
				end

				for _,ent in pairs(ents.FindInBox(v:GetPos() + v:OBBMins() + Offset, v:GetPos() + v:OBBMaxs() - Offset)) do
					if IsValid(ent) and ent ~= v and ent:IsPlayer() and ent:Alive() and ent:GetMoveType()~= MOVETYPE_NOCLIP and v:GetMoveType()~= MOVETYPE_NOCLIP and v:GetNWString("EngrammaOf")=="" then
					
						v:SetCollisionGroup(COLLISION_GROUP_DEBRIS)
						v:SetVelocity(Vector(-15, -15, 0) * 18)
						
						ent:SetVelocity(Vector(15, 15, 0) * 18)
						
						Stuck = true
					end
				end
			   
				if not Stuck then
					v.Stuck = false
					v:SetCollisionGroup(COLLISION_GROUP_PLAYER)
				end
			else
				v:SetCollisionGroup(COLLISION_GROUP_IN_VEHICLE)
			end	
		end
	end
end
timer.Create("CheckIfPlayerStuck", 0.1, 0, CheckIfPlayerStuck)

print("antiplayerstuck active")