
AddCSLuaFile()

EZDoor = EZDoor or {}
EZDoor.list = EZDoor.list or {}
EZDoor.CanSave = EZDoor.CanSave or false
EZDoor.id = EZDoor.id or 0

function EZDoor:FindByID(id)
	for _, ent in ipairs(ents.FindByClass("sent_ezdoor")) do
		if id == ent:GetID() then
			return ent
		end
	end
end

function EZDoor:SaveData()
	if not self.CanSave then return end

	self.list = {}

	if (SERVER) then
		for k, ent in ipairs(ents.FindByClass("sent_ezdoor")) do
			-- Create data table per entity
			local data = {
				["Pos"] = ent:GetPos(),
				["Angles"] = ent:GetAngles(),
				["BodyGroups"] = ent:GetBodyGroups(),
				["Skin"] = ent:GetSkin(),
				["Material"] = ent:GetMaterial(),
				["Color"] = ent:GetColor()
			}
			table.Merge(data, ent:GetNetworkVars())
			table.insert(self.list, data)
		end

		-- Create ezdoor folder
		if not file.IsDir("ezdoor", "DATA") then
			file.CreateDir("ezdoor")
		end

		-- Put our data in a map related to it
		file.Write("ezdoor/"..game.GetMap()..".json", util.TableToJSON(self.list))
		file.Write("ezdoor/"..game.GetMap()..".txt", self.id)

		--print("SAVING DATA:")
		--PrintTable(self.list)
		--print("----\n")
	end
end

if (SERVER) then
	function EZDoor:LoadData()
		-- Get data file
		filepath = "ezdoor/"..game.GetMap()..".json"
		if file.Exists(filepath, "DATA") then
			self.list = util.JSONToTable(file.Read(filepath, "DATA"))
		else
			return
		end

		-- Get id from file
		filepath = "ezdoor/"..game.GetMap()..".txt"
		if file.Exists(filepath, "DATA") then
			self.id = tonumber(file.Read(filepath, "DATA"))
		end

		--print("LOADING DATA:")
		--PrintTable(self.list)
		--print("----\n")

		-- Make sure no doors exist at the moment
		for _, ent in ipairs(ents.FindByClass("sent_ezdoor")) do
			ent:Remove()
		end

		-- Load in our doors
		for _, data in ipairs(self.list) do
			local ent = ents.Create("sent_ezdoor")
			ent:SetPos(data["Pos"])
			ent:SetAngles(data["Angles"])
			ent:Spawn()
			ent:SetID(data["ID"])
			ent:SetDoorName(data["DoorName"])
			ent:SetDoorModel(data["DoorModel"])
			ent:SetTimeToEnter(data["TimeToEnter"])
			ent:SetDistanceToUse(data["DistanceToUse"])
			ent:SetUseTriggerBounds(data["UseTriggerBounds"])
			ent:SetTeleportOffsetVec(data["TeleportOffsetVec"])
			ent:SetOffsetX(data["OffsetX"])
			ent:SetOffsetY(data["OffsetY"])
			ent:SetOffsetZ(data["OffsetZ"])
			ent:SetTeleportOffsetAng(data["TeleportOffsetAng"])
			ent:SetOffsetPitch(data["OffsetPitch"])
			ent:SetOffsetYaw(data["OffsetYaw"])
			ent:SetOffsetRoll(data["OffsetRoll"])

			ent:SetSister(data["Sister"])

			for _, bodygroup in ipairs(data["BodyGroups"]) do
				ent:SetBodygroup(bodygroup.id, bodygroup.num)
			end

			ent:SetSkin(data["Skin"])
			ent:SetMaterial(data["Material"])
			ent:SetColor(data["Color"])
		end

		-- Remove the sister of any ents that no longer exist
		for k, ent in ipairs(ents.FindByClass("sent_ezdoor")) do
			if ent:HasSister() then
				local sister = EZDoor:FindByID(ent:GetSister())
				if not IsValid(sister) then
					ent:SetSister(0)
				end
			end
		end
	end
end

hook.Add("PlayerSpawn", "EZDoorSetNWData", function(ply)
	ply:SetNWBool("isUsingDoor", false)
end)

hook.Add("InitPostEntity", "EZDoorAllowSaving", function()
	EZDoor.CanSave = true
end)

hook.Add("PersistenceSave", "EZDoorSave", function()
	EZDoor:SaveData()
end)

hook.Add("PersistenceLoad", "EZDoorLoad", function()
	EZDoor:LoadData()
end)


hook.Add("ShutDown", "EZDoorShutDown", function()
	EZDoor.ShuttingDown = true
end)