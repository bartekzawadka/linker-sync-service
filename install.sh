
echo "Installing Linker synchronization service"

LOCATION=`dirname $0`/scripts/linker-sync-service

echo "Copying scripts..."
cp $LOCATION '/etc/init.d'
echo "Scripts copied"

echo "Setting privileges"
chmod 755 '/etc/init.d/linker-sync-service'

echo "Adding service to system"
update-rc.d linker-sync-service defaults
echo "Service successfully added"

echo "Finished"
exit 0